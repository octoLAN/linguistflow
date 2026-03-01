# LinguistFlow 🚀

**GDPR-compliant AI-powered blog automation SaaS**

---

## Monorepo Structure

```
linguistflow/
├── backend/    FastAPI (Python) – content engine, scheduling, compliance API
├── frontend/   React 18 + Tailwind + dnd-kit – dashboard, editor, config UI
└── widget/     Vanilla JS Web Component – injectable blog widget
```

---

## Quick Start

### 1. Backend
```bash
cd backend
cp .env.example .env          # fill in your API keys
pip install poetry
poetry install
# Start API server
uvicorn app.main:app --reload --port 8000
# Start Celery worker (separate terminal)
celery -A app.services.scheduler.celery_app worker --loglevel=info
# Start Celery Beat scheduler (separate terminal)
celery -A app.services.scheduler.celery_app beat --loglevel=info
# Apply DB schema
psql $DATABASE_URL < schema.sql
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### 3. Widget (demo)
```bash
# Open directly in your browser
open widget/demo.html
```

### 4. WordPress Plugin
Upload `widget/wp-plugin/linguistflow.php` to your WP `plugins/linguistflow/` directory, activate it, then configure the API URL + Blog ID in **Settings → LinguistFlow**.

---

## Architecture at a Glance

| Layer | Tech | Purpose |
|---|---|---|
| Backend API | FastAPI + SQLAlchemy | CRUD, auth, compliance enforcement |
| Database | PostgreSQL | Customers, blogs, posts, assets |
| Task Queue | Celery + Redis | Async generation, scheduled publishing |
| Content Engine | LangChain + GPT-4o / Claude | RAG → LLM → draft |
| Image Engine | Pexels API + Stable Diffusion | Auto images with compliance tags |
| Frontend | React 18 + Tailwind + dnd-kit | Dashboard, editor, sources, schedule |
| Widget | Vanilla JS Web Component | Shadow DOM injection, no CSS bleed |
| WP Plugin | PHP | Shortcode + WP Admin settings |

---

## GDPR / EU AI Act Compliance

| Requirement | Implementation |
|---|---|
| No visitor IP logging | `NoIPLoggingMiddleware` strips `client.host` globally |
| Human-in-the-Loop | `is_approved=False` default; 403 if publish attempted without approval |
| AI transparency | `is_ai_generated`, `ai_tag` fields on every asset |
| Data minimisation | Widget endpoint collects zero visitor data |
| AVV / GDPR consent | `gdpr_consent` + `avv_accepted` fields on Customer |
| EU-only hosting | Deploy on Frankfurt region (Hetzner / AWS eu-central-1) |

---

## Environment Variables (`.env.example`)

See `backend/.env.example` for all required keys:
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- `PEXELS_API_KEY`
- `DATABASE_URL` (PostgreSQL)
- `REDIS_URL`
- `SECRET_KEY` (JWT signing)
- `LOG_CLIENT_IPS=false` ← **must stay false for GDPR**
