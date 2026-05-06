import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import uvicorn
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

from database import Database
from crawler import Crawler

db = Database()
crawler = Crawler(db)
scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")
FRONTEND = str(Path(__file__).parent.parent / "frontend")


async def generate_yesterday_digest():
    today = datetime.now().date()
    yesterday = (today - timedelta(days=1)).strftime("%Y-%m-%d")
    await crawler.generate_daily_digest(yesterday)


@asynccontextmanager
async def lifespan(app: FastAPI):
    for i, (h, m) in enumerate([(8, 0), (14, 0), (23, 0)], 1):
        scheduler.add_job(crawler.crawl_all, "cron", hour=h, minute=m, id=f"crawl_{i}")
    scheduler.add_job(generate_yesterday_digest, "cron", hour=0, minute=5, id="daily_digest")
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="AI News Daily", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class NewsCreate(BaseModel):
    title: str
    summary: str = ""
    detail: str = ""
    opinion: str = ""
    importance: int = 5
    source_url: str = ""
    source_name: str = ""
    published_at: str = ""
    category: str = "general"
    tags: str = ""


class NewsStateUpdate(BaseModel):
    is_read: Optional[bool] = None
    is_saved: Optional[bool] = None


class PreferencesUpdate(BaseModel):
    category_weights: Optional[dict] = None
    tag_weights: Optional[dict] = None
    saved_boost: Optional[int] = None
    read_penalty: Optional[int] = None


class SubscribedTagsUpdate(BaseModel):
    tags: list[str]


def require_api_key():
    if not crawler.api_key:
        raise HTTPException(status_code=400, detail="未配置 DEEPSEEK_API_KEY，无法使用 AI 处理")


def apply_personal_score(items: list[dict]) -> list[dict]:
    prefs = db.get_preferences()
    cat_w = prefs.get("category_weights", {})
    tag_w = prefs.get("tag_weights", {})
    saved_boost = int(prefs.get("saved_boost", 2) or 0)
    read_penalty = int(prefs.get("read_penalty", 1) or 0)
    result = []
    for it in items:
        score = float(it.get("importance", 5))
        score += float(cat_w.get(it.get("category", ""), 0) or 0)
        tags = [t.strip() for t in (it.get("tags") or "").split(",") if t.strip()]
        score += sum(float(tag_w.get(t, 0) or 0) for t in tags)
        if it.get("is_saved"):
            score += saved_boost
        if it.get("is_read"):
            score -= read_penalty
        result.append({**it, "personal_score": round(score, 2)})
    return sorted(result, key=lambda x: x.get("personal_score", 0), reverse=True)


@app.get("/api/news")
def list_news(
    page: int = 1,
    limit: int = 20,
    date: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = "time",
    saved: bool = False,
    unread: bool = False,
    personalized: bool = False,
):
    data = db.get_news(page=page, limit=limit, date=date, category=category, search=search, sort=sort, only_saved=saved, only_unread=unread)
    if personalized:
        data["items"] = apply_personal_score(data["items"])
    return data


@app.post("/api/news", status_code=201)
def create_news(payload: NewsCreate):
    return db.create_news(payload.model_dump())


@app.put("/api/news/{news_id}")
def update_news(news_id: int, payload: NewsCreate):
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and not data["title"]:
        del data["title"]
    result = db.update_news(news_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@app.delete("/api/news/{news_id}")
def delete_news(news_id: int):
    db.delete_news(news_id)
    return {"success": True}


@app.patch("/api/news/{news_id}/state")
def set_news_state(news_id: int, payload: NewsStateUpdate):
    if not db.get_news_by_id(news_id):
        raise HTTPException(status_code=404, detail="Not found")
    return db.upsert_news_state(news_id, is_read=payload.is_read, is_saved=payload.is_saved)


@app.get("/api/events")
def list_events(date: Optional[str] = None, limit: int = 40):
    return {"items": db.get_events(date=date, limit=limit)}


@app.get("/api/tags/subscribed")
def get_subscribed_tags():
    return {"tags": db.get_subscribed_tags()}


@app.put("/api/tags/subscribed")
def set_subscribed_tags(payload: SubscribedTagsUpdate):
    return {"tags": db.set_subscribed_tags(payload.tags)}


@app.get("/api/news/subscribed")
def list_subscribed_news(page: int = 1, limit: int = 20):
    tags = db.get_subscribed_tags()
    if not tags:
        return {"total": 0, "page": page, "limit": limit, "items": []}
    items = db.get_news(page=1, limit=300, sort="importance")["items"]
    tag_norm = [str(t).strip().lower() for t in tags if str(t).strip()]
    matched = []
    for x in items:
        text = " ".join([
            str(x.get("tags") or ""),
            str(x.get("title") or ""),
            str(x.get("summary") or ""),
            str(x.get("detail") or ""),
        ]).lower()
        if any(k in text for k in tag_norm):
            matched.append(x)
    start = (page - 1) * limit
    end = start + limit
    return {"total": len(matched), "page": page, "limit": limit, "items": matched[start:end]}


@app.get("/api/news/{news_id}")
def get_news(news_id: int):
    item = db.get_news_by_id(news_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@app.get("/api/preferences")
def get_preferences():
    return db.get_preferences()


@app.put("/api/preferences")
def set_preferences(payload: PreferencesUpdate):
    return db.set_preferences(payload.model_dump(exclude_none=True))


@app.get("/api/trends")
def get_trends(days: int = 7):
    return db.get_trends(days=days)


@app.post("/api/crawl")
async def trigger_crawl():
    count = await crawler.crawl_all()
    return {"message": f"成功收录 {count} 条新闻", "count": count}


@app.post("/api/reprocess")
async def reprocess_news(_=Depends(require_api_key)):
    count = await crawler.reprocess_pending()
    return {"message": f"已重新 AI 处理 {count} 条新闻", "count": count}


@app.get("/api/crawl/logs")
def get_crawl_logs():
    return db.get_crawl_logs(limit=10)


@app.get("/api/digests")
def list_digests(page: int = 1, limit: int = 10):
    return db.get_digests(page=page, limit=limit)


@app.post("/api/digests/generate")
async def generate_digest(for_date: Optional[str] = None, _=Depends(require_api_key)):
    if not for_date:
        for_date = datetime.now().strftime("%Y-%m-%d")
    result = await crawler.generate_daily_digest(for_date)
    if not result:
        raise HTTPException(status_code=400, detail="文章数量不足（至少3条）或生成失败")
    return {"message": f"综述已生成（共 {result['article_count']} 条）", "digest": result}


@app.post("/api/digests/generate-weekly")
async def generate_weekly_digest(end_date: Optional[str] = None, _=Depends(require_api_key)):
    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")
    result = await crawler.generate_weekly_digest(end_date)
    if not result:
        raise HTTPException(status_code=400, detail="文章数量不足（至少8条）或生成失败")
    return {"message": "周报已生成", "digest": result}


@app.get("/api/digests/{digest_date}")
def get_digest(digest_date: str):
    item = db.get_digest_by_date(digest_date)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@app.get("/api/dates")
def get_dates():
    return db.get_available_dates()


@app.get("/api/stats")
def get_stats():
    return db.get_stats()


app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND, "js")), name="js")


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


@app.get("/")
def index():
    return FileResponse(os.path.join(FRONTEND, "index.html"))


@app.get("/admin")
def admin():
    return FileResponse(os.path.join(FRONTEND, "admin.html"))


@app.get("/digests")
def digests_page():
    return FileResponse(os.path.join(FRONTEND, "digests.html"))


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
