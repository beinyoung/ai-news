# AI News Daily

AI-powered news aggregator with automated crawling, summarization, and daily digests — built with FastAPI and DeepSeek.

## Features

- Multi-source news crawling with scheduled automation
- AI summarization and opinion analysis via DeepSeek API
- Personalized news feed with scoring
- Daily and weekly digest generation
- Subscribed topic tracking
- QQ email notifications for high-importance news

## Quick Start

```bash
# Windows
start.bat

# Manual
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env   # then edit .env with your keys
.venv\Scripts\python main.py
```

Visit `http://localhost:8000`.

## Configuration

Copy `backend/.env.example` to `backend/.env` and fill in:

- `DEEPSEEK_API_KEY` — API key from [platform.deepseek.com](https://platform.deepseek.com)
- SMTP settings (optional) — for QQ email notifications

## Tech Stack

- **Backend**: FastAPI + Uvicorn
- **Database**: SQLite
- **AI**: DeepSeek API
- **Scheduler**: APScheduler
- **Frontend**: Vanilla HTML/CSS/JS
