import asyncio
import difflib
import json
import os
import re
from datetime import datetime

import feedparser
import httpx

from notifier import Notifier

RSS_FEEDS = (
    {"url": "https://openai.com/blog/rss.xml", "name": "OpenAI Blog", "category": "research"},
    {"url": "https://www.anthropic.com/rss.xml", "name": "Anthropic Blog", "category": "research"},
    {"url": "https://ai.meta.com/blog/rss/", "name": "Meta AI Blog", "category": "research"},
    {"url": "https://huggingface.co/blog/feed.xml", "name": "HuggingFace Blog", "category": "research"},
    {"url": "https://blogs.microsoft.com/ai/feed/", "name": "Microsoft AI Blog", "category": "industry"},
    {"url": "https://ai.googleblog.com/feeds/posts/default", "name": "Google AI Blog", "category": "research"},
    {"url": "https://mistral.ai/news/rss/", "name": "Mistral AI", "category": "research"},
    {"url": "https://cohere.com/blog/rss", "name": "Cohere Blog", "category": "research"},
    {"url": "https://blogs.nvidia.com/feed/", "name": "NVIDIA Blog", "category": "industry"},
    {"url": "https://techcrunch.com/category/artificial-intelligence/feed/", "name": "TechCrunch AI", "category": "industry"},
    {"url": "https://venturebeat.com/category/ai/feed/", "name": "VentureBeat AI", "category": "industry"},
    {"url": "https://www.technologyreview.com/feed/", "name": "MIT Tech Review", "category": "research"},
    {"url": "https://www.marktechpost.com/feed/", "name": "MarkTechPost", "category": "research"},
    {"url": "https://www.deeplearning.ai/the-batch/feed/", "name": "DeepLearning.AI", "category": "research"},
    {"url": "https://www.wired.com/feed/category/artificial-intelligence/latest/rss", "name": "Wired AI", "category": "general"},
    {"url": "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml", "name": "The Verge AI", "category": "industry"},
)

AI_SUMMARY_PROMPT = """你是一位AI领域资深分析师。请对下面新闻进行分析，以JSON格式返回。所有字段请用中文输出。
标题：{title}
来源：{source}
原文摘要：{content}

只返回 JSON：
{{
  "title_zh": "中文标题",
  "summary": "50-100字摘要",
  "detail": "100-200字详细解读",
  "opinion": "50-100字专业评价",
  "importance": 评分(1-10整数),
  "tags": "逗号分隔标签"
}}
"""


class Crawler:

    TAG_MAP = {
        "openai": "OpenAI", "anthropic": "Anthropic", "google": "Google",
        "gemini": "Gemini", "llama": "Llama", "mistral": "Mistral",
        "agent": "Agent", "benchmark": "评测", "safety": "安全",
        "chip": "芯片", "gpu": "GPU", "video": "视频生成",
        "image": "图像生成", "multimodal": "多模态",
        "enterprise": "企业应用", "api": "API", "开源": "开源", "推理": "推理",
    }

    def __init__(self, db):
        self.db = db
        self.api_key = os.getenv("DEEPSEEK_API_KEY", "")
        self.notifier = Notifier()

    async def _call_deepseek(self, prompt: str, model: str = "deepseek-chat", max_tokens: int = 1024, timeout: int = 40) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    "https://api.deepseek.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "content-type": "application/json"},
                    json={"model": model, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]},
                )
                if resp.status_code == 200:
                    return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            print(f"[DeepSeek] API call failed: {e}")
        return None

    async def crawl_all(self) -> int:
        log_id = self.db.create_crawl_log()
        recent_titles = self.db.get_recent_titles(days=7)
        total = 0
        errors = []
        new_articles = []

        for feed in RSS_FEEDS:
            try:
                articles = await self.crawl_feed(feed, recent_titles)
                new_articles.extend(articles)
                total += len(articles)
                print(f"[Crawler] {feed['name']}: +{len(articles)}")
            except Exception as e:
                errors.append(f"{feed['name']}: {e}")
                print(f"[Crawler] Error on {feed['name']}: {e}")

        status = "success" if not errors else ("partial" if total > 0 else "failed")
        self.db.update_crawl_log(log_id, {
            "finished_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_saved": total,
            "errors": "\n".join(errors),
            "status": status,
        })
        self.notifier.notify_important(new_articles)
        return total

    async def crawl_feed(self, feed_info: dict, recent_titles: list) -> list:
        loop = asyncio.get_event_loop()
        feed = await loop.run_in_executor(None, feedparser.parse, feed_info["url"])
        saved = []

        for entry in feed.entries[:10]:
            try:
                url = entry.get("link", "")
                if not url or self.db.url_exists(url):
                    continue

                title = self._clean_html(entry.get("title", "")).strip()
                if not title or self._is_similar_title(title, recent_titles):
                    continue

                raw = self._clean_html(entry.get("summary", entry.get("description", "")))
                published = self._parse_date(entry)

                if self.api_key:
                    data = await self._ai_process(title, raw or title, feed_info)
                else:
                    data = self._simple_process(title, raw)

                data.update({
                    "source_url": url,
                    "source_name": feed_info["name"],
                    "published_at": published,
                    "category": feed_info.get("category", "general"),
                    "is_auto": 1,
                })
                created = self.db.create_news(data)
                recent_titles.append(title)
                saved.append(created)
                await asyncio.sleep(0.2)
            except Exception as e:
                print(f"[Crawler] Entry error: {e}")

        return saved

    async def generate_daily_digest(self, date: str) -> dict | None:
        if not self.api_key:
            return None
        result = self.db.get_news(page=1, limit=50, date=date, sort="importance")
        articles = result["items"]
        if len(articles) < 3:
            return None

        news_text = "\n".join(
            f"{i+1}. [{a['source_name']}] {a['title']}" + (f"\n   {a['summary'][:120]}" if a.get("summary") else "")
            for i, a in enumerate(articles)
        )
        prompt = f"""你是一位 AI 行业分析师。以下是 {date} 收录的 {len(articles)} 条 AI 资讯：
{news_text}

请用晨报模板输出，结构固定：
1) 今日最重要3条
2) 还值得关注3条
3) 关联趋势分析
4) 一句话结论

输出中文正文，不要 markdown 标题。"""

        content = await self._call_deepseek(prompt, model="deepseek-v4-pro", max_tokens=1024, timeout=60)
        if content:
            return self.db.upsert_digest(date, content, len(articles))
        return None

    async def generate_weekly_digest(self, end_date: str) -> dict | None:
        if not self.api_key:
            return None
        result = self.db.get_news(page=1, limit=80, sort="importance")
        items = result["items"]
        if len(items) < 8:
            return None

        news_text = "\n".join(
            f"{i+1}. [{a['source_name']}] {a['title']} ({a.get('importance', 5)}/10)"
            for i, a in enumerate(items)
        )
        prompt = f"""你是一位 AI 产业研究员。以下是近一周新闻：
{news_text}

输出一份周报，结构固定：
1. 本周5大变化
2. 影响判断（开发者/创业者/普通用户）
3. 下周观察清单（3条）
要求：中文，400-700字。"""

        content = await self._call_deepseek(prompt, model="deepseek-chat", max_tokens=1400, timeout=60)
        if content:
            return self.db.upsert_digest(f"week-{end_date}", content, len(items))
        return None

    @staticmethod
    def _is_similar_title(title: str, recent_titles: list, threshold: float = 0.75) -> bool:
        t = title.lower()
        for rt in recent_titles:
            if difflib.SequenceMatcher(None, t, rt.lower()).ratio() >= threshold:
                return True
        return False

    def _simple_process(self, title: str, raw: str) -> dict:
        tags = self._heuristic_tags(title, raw)
        return {
            "title": title,
            "summary": raw[:200] + ("..." if len(raw) > 200 else ""),
            "detail": raw[:1000],
            "opinion": "（未启用 AI 自动评价，可在后台补充）",
            "importance": 5,
            "tags": ",".join(tags),
        }

    async def _ai_process(self, title: str, raw: str, feed_info: dict) -> dict:
        prompt = AI_SUMMARY_PROMPT.format(title=title, source=feed_info["name"], content=raw[:2000])
        text = await self._call_deepseek(prompt)
        if text:
            m = re.search(r"\{.*\}", text, re.DOTALL)
            if m:
                try:
                    r = json.loads(m.group())
                    return {
                        "title": r.get("title_zh") or title,
                        "summary": r.get("summary", ""),
                        "detail": r.get("detail", ""),
                        "opinion": r.get("opinion", ""),
                        "importance": max(1, min(10, int(r.get("importance", 5)))),
                        "tags": self._merge_tags(r.get("tags", ""), self._heuristic_tags(title, raw)),
                    }
                except (json.JSONDecodeError, ValueError, KeyError):
                    pass
        return self._simple_process(title, raw)

    @classmethod
    def _heuristic_tags(cls, title: str, raw: str) -> list:
        text = f"{title} {raw}".lower()
        tags = [v for k, v in cls.TAG_MAP.items() if k in text]
        return list(dict.fromkeys(tags))[:8]

    @staticmethod
    def _merge_tags(tag_str: str, extra_tags: list) -> str:
        base = [x.strip() for x in (tag_str or "").split(",") if x.strip()]
        merged = list(dict.fromkeys(base + extra_tags))
        return ",".join(merged)

    @staticmethod
    def _clean_html(html: str) -> str:
        return re.sub(r"<[^>]+>", "", html or "").strip()

    async def reprocess_pending(self) -> int:
        if not self.api_key:
            return 0
        pending = self.db.get_pending_reprocess()
        count = 0
        for item in pending:
            try:
                title = item["title"]
                content = item.get("detail") or item.get("summary") or title
                feed_info = {"name": item.get("source_name", "未知来源")}
                data = await self._ai_process(title, content, feed_info)
                self.db.update_news(item["id"], {
                    "title": data["title"],
                    "summary": data["summary"],
                    "detail": data["detail"],
                    "opinion": data["opinion"],
                    "importance": data["importance"],
                    "tags": data["tags"],
                })
                count += 1
                await asyncio.sleep(0.4)
            except Exception as e:
                print(f"[Reprocess] Error on id={item['id']}: {e}")
        return count

    @staticmethod
    def _parse_date(entry) -> str:
        if getattr(entry, "published_parsed", None):
            try:
                return datetime(*entry.published_parsed[:6]).strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                pass
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
