# Dixlab

Build portfolios, CVs and case studies from one set of details.

```
dixlab/
├── frontend/   React + Vite app (all pages and templates)
└── backend/    Python + FastAPI API (accounts, projects, uploads, AI customise)
```

## Run it locally

You need Python 3.10+ and Node 18+. Use two terminals.

**1. Backend** (http://127.0.0.1:8000, API docs at http://127.0.0.1:8000/docs)

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # optional: add ANTHROPIC_API_KEY for AI customise
uvicorn app.main:app --reload --port 8000
```

**2. Frontend** (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```

Vite forwards `/api` and `/uploads` to the backend, so the browser only ever talks to one origin.

## API

| Method | Path | Used by |
|---|---|---|
| `POST` | `/api/auth/signup` | Sign up page |
| `POST` | `/api/auth/login` | Log in page |
| `GET` | `/api/auth/me` | App start-up (refreshes your name and email) |
| `PATCH` | `/api/auth/me` | Update your name |
| `POST` | `/api/auth/logout` | Sidebar "Log out" |
| `GET` | `/api/projects` | Dashboard, Portfolios, CVs and Case studies lists (sync) |
| `GET` | `/api/projects/{id}` | Editor, opening a project not cached in this browser |
| `PUT` | `/api/projects/{id}` | Editor autosave, "Use template", sync |
| `DELETE` | `/api/projects/{id}` | Delete buttons (also removes the project's uploaded images) |
| `POST` | `/api/uploads` | Case study cover and supporting visuals |
| `DELETE` | `/api/uploads/{name}` | Remove an uploaded image |
| `POST` | `/api/customize` | Customize tab, "Describe a change" (portfolio, CV and case study) |
| `GET` | `/api/interview/topics` | Interview progress list |
| `POST` | `/api/interview/next` | Interview: the next question (follows up on vague answers) |
| `POST` | `/api/interview/draft` | Interview: "Write my case study" |
| `GET` / `POST` / `DELETE` | `/api/projects/{id}/publish` | Publish dialog: status and views, publish or update, unpublish |
| `GET` | `/api/public/{slug}` | Public page at `/p/{slug}` (no login; published fields only) |
| `GET` | `/api/health` | Health check |

Everything except `/api/auth/signup`, `/api/auth/login`, `/api/public/*` and `/api/health` needs `Authorization: Bearer <token>`.

## How the frontend uses it

- **Signed out:** everything works in the browser, as before, with sample projects to explore.
- **Signed in:** projects are cached in the browser and every change is saved to your account. On start-up, after logging in, and when the connection returns, the browser and the server are reconciled, and changes made offline are uploaded.
- **AI customise** runs on the server (`ANTHROPIC_API_KEY` in `backend/.env`). If it isn't configured, you're signed out, or the backend is down, the Customize tab falls back to the built-in keyword matcher ("Quick match").

## The core flow

1. **Interview** (`/interview/:id`): one question at a time across seven topics (the project, the problem, your part, what you tried, what you cut, what changed, what you learned), with follow-ups on thin answers. Type or speak.
2. **Draft**: written from your answers, in your words. Nothing is invented; anything you didn't say is left blank. "Undo draft" restores what was there.
3. **Publish**: a link (`/p/your-title-xxxxxxxxxx`) that looks like the preview, with a view count. It's a snapshot, so later edits stay private until you update it.

Without an API key the interview still works, using guided questions and a draft built from your own sentences.

To learn where people stall, follow [docs/user-session.md](docs/user-session.md) with one real user before beta.

## Tests

```bash
cd backend
python -m pytest
```

## Production notes

- Data lives in SQLite (`backend/data/dixlab.db`) and images in `backend/uploads/`. Back both up, or point `DIXLAB_DB` and `DIXLAB_UPLOADS` somewhere durable.
- Serve `frontend/dist` behind the same domain as the API, or set `DIXLAB_CORS_ORIGINS` to the frontend's origin.
- Uploaded images and published pages are served publicly at unguessable URLs. Published pages never include account details, interview transcripts or unpublished edits.
- Keep `ANTHROPIC_API_KEY` in `backend/.env` (git-ignored) or your host's secret settings. It is only read by the server and never sent to the browser.
- In production, serve the frontend so unknown paths (like `/p/...` and `/interview/...`) fall back to `index.html`.
