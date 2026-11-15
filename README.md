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
| `POST` | `/api/auth/verify/send`, `/api/auth/verify` | Confirm your email (needed to publish) |
| `POST` | `/api/auth/password/forgot`, `/api/auth/password/reset` | "Forgot your password?" and the emailed reset link |
| `POST` | `/api/auth/password/change` | Account page: change password |
| `DELETE` | `/api/auth/me` | Account page: delete your account and everything in it |
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
| `POST` | `/api/public/{slug}/contact` | Portfolio "Get in touch" form (no login; rate limited; spam honeypot) |
| `GET` | `/api/messages` | Messages inbox and the sidebar unread count |
| `PATCH` / `DELETE` | `/api/messages/{id}` | Mark a message read, delete it |
| `GET` | `/api/admin/*` | Admin dashboard (admins only): overview, users, pages, messages, storage, activity, system |
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
- **Account emails** (confirm your email, reset your password) need SMTP and `DIXLAB_PUBLIC_URL` set to the site's address. New accounts must confirm their email before publishing; accounts that existed before this feature count as confirmed. To try it locally without SMTP, set `DIXLAB_MAIL_TO_LOG=true` and the emails appear in the backend terminal (never do this on a real server).
- **Admin dashboard:** sign up in the app, then run `.venv\Scripts\python -m app.admin_cli grant you@example.com` in `backend/`. Admins land on `/admin` when they log in. See `docs/admin-dashboard.md`.
- **Production mode:** set `DIXLAB_ENV=production` on the live server. The API then refuses to start with unsafe settings (`DIXLAB_MAIL_TO_LOG` on, a non-https `DIXLAB_PUBLIC_URL`, localhost or http in `DIXLAB_CORS_ORIGINS`), logs warnings for risky ones, hides `/docs`, always marks the session cookie Secure, and requires admins to use two-step login. Run `python -m app.prodcheck` in `backend/` with the live environment before deploying.
- **Security headers:** the API sets its own. `npm run build` writes the frontend's `production` headers (from `frontend/security-headers.js`) into `dist/_headers` (Netlify, Cloudflare Pages), `dist/vercel.json` (Vercel) and `dist/headers.json` (copy these into any other host's settings). Serve everything over HTTPS.
- **Rate limits** (logins, two-step codes, sign-ups, emails, contact form, AI, page views) are stored in SQLite (`backend/data/dixlab-ratelimits.db`), so all workers share them and they survive restarts. Behind a reverse proxy set `DIXLAB_TRUST_PROXY_HOPS=1` so they see visitors' real IPs (and so `X-Forwarded-Proto` is trusted). With several servers, also limit at the proxy.
- **Two-step login:** anyone can turn it on in Your account (authenticator app + 10 one-time recovery codes). Someone who loses both: `python -m app.admin_cli reset-2fa them@example.com`, after confirming who they are. `DIXLAB_ADMIN_REQUIRE_2FA` (on in production) keeps admins without it out of the dashboard.
- **Passwords:** at least 8 characters, and common passwords or ones that are just the person's email or name are refused. Optionally, `DIXLAB_PWNED_PASSWORD_CHECK=true` also refuses passwords from known data breaches via Have I Been Pwned (only the first 5 characters of the password's SHA-1 hash are sent).
- **Uploads:** PDFs with scripts or other active content, and Office files with macros, embedded programs, remote templates or zip bombs, are refused. For virus scanning, run ClamAV (`clamd`) and set `DIXLAB_CLAMAV=127.0.0.1:3310`. Uploads are then refused if the scanner can't be reached.
- **Sessions** end 30 days after login (`DIXLAB_SESSION_DAYS`) or after 7 days unused (`DIXLAB_SESSION_IDLE_DAYS`). They use an HttpOnly, SameSite=Lax cookie (`dixlab_session`), marked Secure over HTTPS. Serve the frontend and the API from the **same domain** (the dev server's proxy does this locally) so the cookie is sent. Changes made with the cookie need the `X-Dixlab-Request: 1` header, which the frontend always sends. API clients can still use `Authorization: Bearer` (ask for a token with `X-Dixlab-Want-Token: 1` when logging in).
- **Per-account limits:** 1 GB of uploads (`DIXLAB_STORAGE_MB_PER_USER`) and 100 projects (`DIXLAB_MAX_PROJECTS_PER_USER`). When someone is nearly full, their unused uploads are cleared first.
- **Get in touch emails:** set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` in `backend/.env` (see `.env.example`). Without them, messages are kept in each owner's Messages inbox only. The owner's address is never shown to visitors. Behind a reverse proxy, the per-visitor rate limit sees the proxy's IP; put a limit at the proxy too.

- Data lives in SQLite (`backend/data/dixlab.db`) and images in `backend/uploads/`. Back both up, or point `DIXLAB_DB` and `DIXLAB_UPLOADS` somewhere durable.
- Serve `frontend/dist` behind the same domain as the API, or set `DIXLAB_CORS_ORIGINS` to the frontend's origin.
- Uploaded images and published pages are served publicly at unguessable URLs. Published pages never include account details, interview transcripts or unpublished edits.
- Keep `ANTHROPIC_API_KEY` in `backend/.env` (git-ignored) or your host's secret settings. It is only read by the server and never sent to the browser.
- In production, serve the frontend so unknown paths (like `/p/...` and `/interview/...`) fall back to `index.html`.
