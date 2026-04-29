import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "news.db")


class Database:
    def __init__(self):
        self._init_db()

    def _conn(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        conn = self._conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS news (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT NOT NULL,
                summary     TEXT DEFAULT '',
                detail      TEXT DEFAULT '',
                opinion     TEXT DEFAULT '',
                importance  INTEGER DEFAULT 5,
                source_url  TEXT DEFAULT '',
                source_name TEXT DEFAULT '',
                published_at TEXT,
                created_at  TEXT DEFAULT (datetime('now', 'localtime')),
                category    TEXT DEFAULT 'general',
                tags        TEXT DEFAULT '',
                is_auto     INTEGER DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS crawl_logs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at  TEXT NOT NULL,
                finished_at TEXT,
                total_saved INTEGER DEFAULT 0,
                errors      TEXT DEFAULT '',
                status      TEXT DEFAULT 'running'
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS digests (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                date          TEXT UNIQUE NOT NULL,
                content       TEXT DEFAULT '',
                article_count INTEGER DEFAULT 0,
                created_at    TEXT DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_news_state (
                news_id    INTEGER PRIMARY KEY,
                is_read    INTEGER DEFAULT 0,
                is_saved   INTEGER DEFAULT 0,
                read_at    TEXT,
                saved_at   TEXT,
                FOREIGN KEY(news_id) REFERENCES news(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                key        TEXT PRIMARY KEY,
                value      TEXT DEFAULT ''
            )
        """)
        # Keep startup resilient for existing datasets that may already contain duplicate URLs.
        conn.execute("CREATE INDEX IF NOT EXISTS idx_news_source_url ON news(source_url)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_news_category ON news(category)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_news_importance ON news(importance)")
        conn.commit()
        conn.close()

    def get_news(self, page=1, limit=20, date=None, category=None, search=None, sort="time", only_saved=False, only_unread=False):
        conn = self._conn()
        conditions, params = [], []

        if date:
            conditions.append("date(n.published_at) = ?")
            params.append(date)
        if category and category != "all":
            conditions.append("n.category = ?")
            params.append(category)
        if search:
            conditions.append("(n.title LIKE ? OR n.summary LIKE ? OR n.tags LIKE ?)")
            params += [f"%{search}%"] * 3
        if only_saved:
            conditions.append("COALESCE(s.is_saved, 0) = 1")
        if only_unread:
            conditions.append("COALESCE(s.is_read, 0) = 0")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        order = "n.importance DESC, n.published_at DESC" if sort == "importance" else "n.published_at DESC, n.importance DESC"
        from_join = "FROM news n LEFT JOIN user_news_state s ON n.id = s.news_id"
        total = conn.execute(f"SELECT COUNT(*) {from_join} {where}", params).fetchone()[0]
        offset = (page - 1) * limit
        rows = conn.execute(
            f"""SELECT n.*, COALESCE(s.is_read, 0) as is_read, COALESCE(s.is_saved, 0) as is_saved
                {from_join} {where} ORDER BY {order} LIMIT ? OFFSET ?""",
            params + [limit, offset],
        ).fetchall()
        conn.close()
        return {"total": total, "page": page, "limit": limit, "items": [dict(r) for r in rows]}

    def get_news_by_id(self, news_id):
        conn = self._conn()
        row = conn.execute("SELECT * FROM news WHERE id = ?", [news_id]).fetchone()
        conn.close()
        return dict(row) if row else None

    def create_news(self, data):
        if not data.get("published_at"):
            data["published_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn = self._conn()
        cur = conn.execute(
            """INSERT INTO news (title, summary, detail, opinion, importance, source_url,
               source_name, published_at, category, tags, is_auto)
               VALUES (:title, :summary, :detail, :opinion, :importance, :source_url,
               :source_name, :published_at, :category, :tags, :is_auto)""",
            {**data, "is_auto": data.get("is_auto", 0)},
        )
        conn.commit()
        row = conn.execute("SELECT * FROM news WHERE id = ?", [cur.lastrowid]).fetchone()
        conn.close()
        return dict(row)
        
    def upsert_news_state(self, news_id: int, is_read=None, is_saved=None):
        conn = self._conn()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        row = conn.execute("SELECT * FROM user_news_state WHERE news_id = ?", [news_id]).fetchone()
        if not row:
            conn.execute("INSERT INTO user_news_state (news_id) VALUES (?)", [news_id])
        updates = {}
        if is_read is not None:
            updates["is_read"] = 1 if is_read else 0
            updates["read_at"] = now if is_read else None
        if is_saved is not None:
            updates["is_saved"] = 1 if is_saved else 0
            updates["saved_at"] = now if is_saved else None
        if updates:
            sets = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE user_news_state SET {sets} WHERE news_id = ?",
                list(updates.values()) + [news_id],
            )
        conn.commit()
        out = conn.execute("SELECT * FROM user_news_state WHERE news_id = ?", [news_id]).fetchone()
        conn.close()
        return dict(out) if out else {"news_id": news_id, "is_read": 0, "is_saved": 0}

    def get_setting(self, key: str, default=None):
        conn = self._conn()
        row = conn.execute("SELECT value FROM user_settings WHERE key = ?", [key]).fetchone()
        conn.close()
        if not row:
            return default
        value = row["value"]
        try:
            return json.loads(value)
        except Exception:
            return value

    def set_setting(self, key: str, value):
        conn = self._conn()
        if not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False)
        conn.execute(
            """INSERT INTO user_settings (key, value) VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value""",
            [key, value],
        )
        conn.commit()
        conn.close()

    def get_subscribed_tags(self) -> list:
        return self.get_setting("subscribed_tags", default=[]) or []

    def set_subscribed_tags(self, tags: list):
        norm = sorted({str(t).strip() for t in tags if str(t).strip()})
        self.set_setting("subscribed_tags", norm)
        return norm

    def get_preferences(self) -> dict:
        default = {
            "category_weights": {},
            "tag_weights": {},
            "saved_boost": 2,
            "read_penalty": 1,
        }
        prefs = self.get_setting("user_preferences", default=default) or default
        for k, v in default.items():
            prefs.setdefault(k, v)
        return prefs

    def set_preferences(self, prefs: dict) -> dict:
        current = self.get_preferences()
        current.update(prefs or {})
        self.set_setting("user_preferences", current)
        return current

    def get_events(self, date=None, limit=50):
        result = self.get_news(page=1, limit=200, date=date, sort="importance")
        buckets = {}
        for item in result["items"]:
            key = self._event_key(item)
            bucket = buckets.setdefault(key, {"event_key": key, "items": []})
            bucket["items"].append(item)
        events = []
        for b in buckets.values():
            items = sorted(b["items"], key=lambda x: x.get("importance", 5), reverse=True)
            top = items[0]
            events.append({
                "event_key": b["event_key"],
                "title": top["title"],
                "importance": top.get("importance", 5),
                "category": top.get("category", "general"),
                "summary": top.get("summary", ""),
                "sources": sorted({x.get("source_name", "") for x in items if x.get("source_name")}),
                "count": len(items),
                "items": items[:6],
            })
        events.sort(key=lambda x: (x["importance"], x["count"]), reverse=True)
        return events[:limit]

    def get_trends(self, days=7):
        conn = self._conn()
        rows = conn.execute(
            """SELECT date(published_at) as date,
                      COUNT(*) as total,
                      SUM(CASE WHEN importance >= 8 THEN 1 ELSE 0 END) as high_impact
               FROM news
               WHERE published_at >= datetime('now', ?, 'localtime')
               GROUP BY date(published_at)
               ORDER BY date ASC""",
            [f"-{days} days"],
        ).fetchall()
        tags_rows = conn.execute(
            """SELECT tags FROM news
               WHERE published_at >= datetime('now', ?, 'localtime')
                 AND tags != ''""",
            [f"-{days} days"],
        ).fetchall()
        src_rows = conn.execute(
            """SELECT source_name, COUNT(*) as count
               FROM news
               WHERE published_at >= datetime('now', ?, 'localtime')
               GROUP BY source_name
               ORDER BY count DESC
               LIMIT 10""",
            [f"-{days} days"],
        ).fetchall()
        conn.close()
        tag_count = {}
        for r in tags_rows:
            for t in (r["tags"] or "").split(","):
                tag = t.strip()
                if tag:
                    tag_count[tag] = tag_count.get(tag, 0) + 1
        top_tags = sorted(tag_count.items(), key=lambda x: x[1], reverse=True)[:12]
        return {
            "daily": [dict(r) for r in rows],
            "top_sources": [dict(r) for r in src_rows if r["source_name"]],
            "top_tags": [{"tag": k, "count": v} for k, v in top_tags],
        }

    @staticmethod
    def _event_key(item: dict) -> str:
        words = [w.lower() for w in (item.get("title", "").replace("-", " ").split()) if len(w) > 3]
        return " ".join(words[:4]) or f"id-{item.get('id')}"

    def update_news(self, news_id, data):
        if not data:
            return self.get_news_by_id(news_id)
        conn = self._conn()
        sets = ", ".join(f"{k} = ?" for k in data)
        conn.execute(f"UPDATE news SET {sets} WHERE id = ?", list(data.values()) + [news_id])
        conn.commit()
        row = conn.execute("SELECT * FROM news WHERE id = ?", [news_id]).fetchone()
        conn.close()
        return dict(row) if row else None

    def delete_news(self, news_id):
        conn = self._conn()
        conn.execute("DELETE FROM news WHERE id = ?", [news_id])
        conn.commit()
        conn.close()

    def get_available_dates(self):
        conn = self._conn()
        rows = conn.execute(
            """SELECT date(published_at) as date, COUNT(*) as count
               FROM news GROUP BY date(published_at)
               ORDER BY date DESC LIMIT 60"""
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def get_stats(self):
        conn = self._conn()
        total = conn.execute("SELECT COUNT(*) FROM news").fetchone()[0]
        today = conn.execute(
            "SELECT COUNT(*) FROM news WHERE date(published_at) = date('now', 'localtime')"
        ).fetchone()[0]
        by_cat = conn.execute(
            "SELECT category, COUNT(*) as count FROM news GROUP BY category ORDER BY count DESC"
        ).fetchall()
        conn.close()
        return {"total": total, "today": today, "by_category": [dict(r) for r in by_cat]}

    def url_exists(self, url):
        if not url:
            return False
        conn = self._conn()
        n = conn.execute("SELECT COUNT(*) FROM news WHERE source_url = ?", [url]).fetchone()[0]
        conn.close()
        return n > 0

    def get_recent_titles(self, days: int = 7) -> list:
        conn = self._conn()
        rows = conn.execute(
            "SELECT title FROM news WHERE created_at >= datetime('now', ?, 'localtime')",
            [f"-{days} days"],
        ).fetchall()
        conn.close()
        return [r["title"] for r in rows]

    def create_crawl_log(self) -> int:
        conn = self._conn()
        cur = conn.execute(
            "INSERT INTO crawl_logs (started_at, status) VALUES (?, 'running')",
            [datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
        )
        conn.commit()
        log_id = cur.lastrowid
        conn.close()
        return log_id

    def update_crawl_log(self, log_id: int, data: dict):
        conn = self._conn()
        sets = ", ".join(f"{k} = ?" for k in data)
        conn.execute(f"UPDATE crawl_logs SET {sets} WHERE id = ?", list(data.values()) + [log_id])
        conn.commit()
        conn.close()

    def get_crawl_logs(self, limit: int = 10) -> list:
        conn = self._conn()
        rows = conn.execute(
            "SELECT * FROM crawl_logs ORDER BY started_at DESC LIMIT ?", [limit]
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def upsert_digest(self, date: str, content: str, article_count: int) -> dict:
        conn = self._conn()
        conn.execute(
            """INSERT INTO digests (date, content, article_count) VALUES (?, ?, ?)
               ON CONFLICT(date) DO UPDATE SET
                 content=excluded.content,
                 article_count=excluded.article_count,
                 created_at=datetime('now','localtime')""",
            [date, content, article_count],
        )
        conn.commit()
        row = conn.execute("SELECT * FROM digests WHERE date = ?", [date]).fetchone()
        conn.close()
        return dict(row)

    def get_digests(self, page: int = 1, limit: int = 10) -> dict:
        conn = self._conn()
        total = conn.execute("SELECT COUNT(*) FROM digests").fetchone()[0]
        offset = (page - 1) * limit
        rows = conn.execute(
            "SELECT * FROM digests ORDER BY date DESC LIMIT ? OFFSET ?",
            [limit, offset],
        ).fetchall()
        conn.close()
        return {"total": total, "page": page, "limit": limit, "items": [dict(r) for r in rows]}

    def get_digest_by_date(self, date: str):
        conn = self._conn()
        row = conn.execute("SELECT * FROM digests WHERE date = ?", [date]).fetchone()
        conn.close()
        return dict(row) if row else None

    def digest_exists(self, date: str) -> bool:
        conn = self._conn()
        n = conn.execute(
            "SELECT COUNT(*) FROM digests WHERE date = ? AND content != ''", [date]
        ).fetchone()[0]
        conn.close()
        return n > 0

    def get_pending_reprocess(self):
        conn = self._conn()
        rows = conn.execute(
            "SELECT * FROM news WHERE opinion = '（未启用 AI 自动评价，可在后台补充）' ORDER BY published_at DESC LIMIT 100"
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
