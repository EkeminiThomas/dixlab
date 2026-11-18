# Admin dashboard: setting up your admin login, and what's inside

The admin dashboard lives at **`/admin`**. It is where the people who run Dixlab watch the product grow, see what users are doing, and handle problems, all without touching the database.

**Where the admin code lives:**
- **Backend:** `backend/app/admin/`
  - `routes.py`: the admin API
  - `access.py`: who is an admin, and the check on every admin request
  - `cli.py`: the terminal command
- **Website:** `frontend/src/admin/` (the pages, `kit.jsx` and `admin.css`)
- **Tests:** `backend/tests/test_admin.py`

---

## Set up your admin login

You become an admin in two steps: you **create a normal account on the website**, then you **grant it admin from the server's terminal**. You can't become an admin by signing up with a particular email, or from the website at all. Only someone with access to the server can make the first admin.

### Before you start

| You need | Why |
|---|---|
| **Email that actually sends** (SMTP or SendLiberty, see below) | New accounts must confirm their email with a 6-digit code before they can use the app. |
| **An authenticator app** on your phone (Google Authenticator, Microsoft Authenticator, Authy, 1Password…) | On the live site, admins **must** use two-step login (`DIXLAB_ADMIN_REQUIRE_2FA` is on in production). |
| **Access to the server's terminal** | The grant command runs where the database is. |

### A. On your computer (for testing)

1. **Start the backend and the website.**
   ```powershell
   cd "C:\Users\Thomas Ekemini\dixlab\backend"
   .venv\Scripts\activate
   uvicorn app.main:app --reload --port 8000
   ```
   In a second terminal:
   ```powershell
   cd "C:\Users\Thomas Ekemini\dixlab\frontend"
   npm run dev
   ```
2. **Sign up** at http://localhost:5173/signup with the email you want as admin.
3. **Confirm your email.** Type the 6-digit code from the email on the "Confirm your email" screen.
   - No real email set up? Add `DIXLAB_MAIL_TO_LOG=true` and `DIXLAB_ENV=development` to `backend/.env` and restart the backend. The email, code included, is then printed in the backend terminal.
4. **Grant admin.** In a terminal in the `backend` folder (venv active):
   ```powershell
   python -m app.admin grant you@example.com
   ```
   It replies `you@example.com is now an admin.` Check with `python -m app.admin list`.
5. **Log out and log in again** at http://localhost:5173/login. Admins land on **`/admin`**. In the app, the sidebar also shows **Admin dashboard**.

Two-step login is optional on your computer, because `DIXLAB_ENV` isn't `production`. Turn it on anyway if you want to test it (step B4).

### B. On the live site (Vercel + pxxl)

The website on Vercel sends every `/api` request to the backend on pxxl (`dixlab.pxxl.click`), so **your admin account lives in the pxxl backend's database**.

1. **Check the backend settings on pxxl.** `backend/.env` is never uploaded, so set these in pxxl's dashboard → Environment Variables:
   ```
   DIXLAB_ENV=production
   DIXLAB_PUBLIC_URL=https://<your Vercel or custom domain>
   DIXLAB_CORS_ORIGINS=https://<your Vercel or custom domain>
   DIXLAB_TRUST_PROXY_HOPS=1
   DIXLAB_MAIL_TO_LOG=false
   # email, ONE of:
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=you@gmail.com
   SMTP_PASSWORD=<16-character Google app password>
   SMTP_FROM=Dixlab <you@gmail.com>
   #   or
   SENDLIBERTY_API_KEY=<key from sendliberty.com → Dashboard → API keys>
   SENDLIBERTY_FROM=Dixlab <the Gmail you connected in SendLiberty>
   ```
   - Redeploy or restart after changing them; settings are only read at startup.
   - **Make sure pxxl keeps the database between deploys:** add a persistent volume or disk for `/app/backend/data` (the database) and `/app/backend/uploads`. Without one, every redeploy wipes all accounts, including your admin role.
2. **Sign up on the live site** (`https://<your site>/signup`) and **confirm your email** with the code.
3. **Grant admin.**

   **No terminal? (pxxl's Free plan locks the Terminal tab.)** Use the first-admin setting instead:
   1. In pxxl → your backend → **Secrets**, add `DIXLAB_FIRST_ADMIN=you@example.com`, the email you signed up with.
   2. **Redeploy or restart** the backend.
   3. That's it. The account becomes an admin at start-up, or the moment it confirms its email. The backend log says `DIXLAB_FIRST_ADMIN: you@example.com is now the first admin.`

   It only works while the site has **no admin yet**, and only for an account whose email is **confirmed**. Once you're an admin it does nothing, so removing it afterwards is tidy but not urgent.

   **With a terminal** (its shell or console for the backend service), run this instead. The app's folder there is `/app/backend`:
   ```sh
   cd /app/backend
   python -m app.admin grant you@example.com
   python -m app.admin list
   ```
4. **Turn on two-step login. This is required for admins on the live site.**
   1. Log in, then click your avatar at the bottom of the sidebar → **View profile** → **Two-step login**.
   2. Scan the QR code with your authenticator app and type the 6-digit code it shows.
   3. **Save the 10 recovery codes somewhere safe** (a password manager). Each one works once if you lose your phone.

   Until this is on, `/admin` says *"Turn on two-step login in Your account before using the admin dashboard."*
5. **Log in** at `https://<your site>/login`: email, password, then the code from your authenticator app. You land on **`/admin`**.

### Admin commands

Run these in the `backend` folder: on your computer with the venv active, or in `/app/backend` on the server.

| Command | What it does |
|---|---|
| `python -m app.admin grant you@example.com` | Makes an existing account an admin. Sign up first. |
| `python -m app.admin revoke them@example.com` | Removes admin. It refuses to remove the **last** admin, so you can't lock everyone out. |
| `python -m app.admin list` | Shows every admin. |
| `python -m app.admin reset-2fa them@example.com` | Turns off someone's two-step login and logs them out everywhere, for a lost phone and lost recovery codes. **Confirm who's asking first**, for example by a reply from that account's email. |
| `python -m app.admin set-plan them@example.com premium` | Gives a plan by hand: `free`, `starter`, `pro`, `premium`, or `none` to remove it. Handy for testing or for team accounts. |

Every one of these is recorded in the activity log, tagged as done from the terminal. The old form `python -m app.admin_cli …` no longer exists.

**Adding teammates later:** once you're in, open **Users**, click the person, then click **Make admin**. They must already have an account, and on the live site they'll also need two-step login.

### If something goes wrong

| What you see | What it means / what to do |
|---|---|
| `No account with the email …` | Sign up on that site first. Each site (your computer, the live site) has its own accounts. Check the spelling. |
| `/admin` says **"Admins only"** | The grant didn't reach this database. Did you run it on the right server? Run `python -m app.admin list` there, then log out and in again. |
| `/admin` asks you to **turn on two-step login** | Expected on the live site: follow step B4. |
| You keep landing on **"Confirm your email"** | Email isn't arriving. Check the backend log for `Couldn't send email…` or `SendLiberty refused…`, check spam, and check the email settings above. |
| You lost your phone **and** your recovery codes | Run `python -m app.admin reset-2fa you@example.com` on the server, log in with your password, and set two-step login up again. |
| Your admin role disappears after a deploy | The database isn't on a persistent volume, so it was recreated empty. Add the volume (step B1), then sign up and grant again. |

**Why the terminal, not a sign-up setting:** an "admin email" setting would hand admin to whoever registers that address first. Only someone with access to the server can run the command, and every grant is recorded in the activity log. (The old `DIXLAB_ADMIN_EMAILS` setting is ignored, and the server warns if it's still set.)

**The server checks admin rights on every request** (`require_admin` in `app/admin/access.py`). Hiding the dashboard from regular users isn't the only protection: a regular user who opens `/admin` sees "Admins only", and the admin API answers 403.

---

## The sections

### 1. Overview: is Dixlab growing, and is it working?

| What you see | Why it's there | What you'd use it for |
|---|---|---|
| **Eight headline numbers:** total users, new users, active in the last 7 days, live pages, page views, AI requests, Get in touch messages, errors in the last 24 hours | The vital signs of the product, on one screen | Your daily check-in. Each number is compared with the previous period (▲/▼ and %), so you can see whether things are improving. |
| **7 / 30 / 90 day switch** | Different questions need different time spans | 7 days for "how was this week?", 90 days for trends |
| **Daily chart:** sign-ups, projects started, pages published, or page views | Shows *when* things happen, not just totals | Spot the effect of a launch, a post or an outage. Hover a day for its number; **Table** shows the same data as a list. |
| **Live activity:** the 12 latest things people did | The "what's going on right now" feed you asked for | Watch real usage as it happens, such as "Amara published a portfolio" |
| **Funnel:** signed up → created a project → published a page → got a view → got a message | Shows where people drop off | The most useful number for product decisions. For example, if many people sign up but few publish, the editor or the publish step needs work. |
| **Popular templates** | Shows which of the 30 templates people choose | Decide which templates to improve, promote or retire |
| **What people make:** portfolio, CV or case study | Shows which of the three products is used most | Prioritise the roadmap |
| **AI features:** Customize, interview questions and drafts, with failure counts | AI costs money and can fail | Watch usage, cost and reliability |

### 2. Users: everyone with an account

- **Search** by name, email or user id.
- **Filter** to everyone, active, suspended or admins.
- **Sort** by newest, last active, most projects, most views, name or oldest.
- Each row shows when the person joined, when they were last active, their project count, live pages, total views, and status.
- **Export CSV** downloads the list as a spreadsheet, using the current filter. It's useful for newsletters, investor updates or your own analysis. Names starting with `=`, `+`, `-` or `@` are made safe, so the file can't run spreadsheet formulas. Every export is recorded in the activity log.

### 3. User page: one person in detail

**Click anyone in the list** to see:
- Their numbers: projects, live pages, views, messages received and storage used.
- Each of their projects, with its template, when it was last edited, and a link to the live page.
- Their recent activity.

**Account actions.** Each one asks for confirmation and is recorded in the activity log:

| Action | What it does | When you'd use it |
|---|---|---|
| **Suspend** (with an optional reason) | Signs them out everywhere and blocks logging in. Their published pages and contact forms go offline. **Nothing is deleted.** | Spam, abuse, or a pause while you investigate |
| **Unsuspend** | Reverses a suspension; their pages come back | The issue is resolved |
| **Sign out everywhere** | Ends every active login on every device | "I think someone got into my account" |
| **Make admin / Remove admin** | Gives or removes access to this dashboard | Adding a teammate |
| **Delete account** | Permanently removes the account, its projects, pages, messages and uploaded files. **You must type their email to confirm.** | A person asks to be deleted (a privacy-law right), or a confirmed spam account |

**Built-in safety rules:**
- You can't suspend, delete or remove admin from **yourself**, so you can't lock yourself out.

### 4. Published pages: everything that's live

- Every live portfolio, CV and case study, with its owner, type, template, when it was published and last updated, and its views.
- **Search** by title, link or owner; **filter** by type; **sort** by newest, recently updated or most viewed.
- **Take down** unpublishes a page straight away and records your reason. The owner's project is kept.
- **Use:** check what's going out under the Dixlab name, remove anything that breaks your rules, and find your most-viewed pages to showcase.

### 5. Messages: Get in touch traffic

- Shows who wrote to whom, when, how long the message was, whether it was emailed, and whether the owner has read it.
- **It never shows what visitors wrote.** That stays private between the visitor and the portfolio owner, as people would expect.
- A **"Possible spam"** label appears when one sender has written to 3 or more different portfolios in a day.
- **Delete** removes a spam message, including from the owner's inbox.
- Shows whether email delivery is switched on.

### 6. Storage: what's using disk space

- Total stored, size on disk, and space used by videos, which are usually the biggest share.
- Space broken down by type (images, videos, documents) and by user.
- The 15 largest files.
- **Delete unused uploads:** files that no project or live page uses any more, for example after someone replaces an image. It only touches files uploaded more than a day ago, so nothing someone is still editing is caught.
- **Use:** keep hosting costs under control, and spot accounts using far more space than normal.

### 7. Activity log: everything, with an audit trail

- Every recorded event, newest first. You can filter by accounts, projects, publishing, AI, uploads, messages, admin actions or errors, or show one user's activity.
- **Admin actions** (suspend, takedown, delete, export, cleanup) show **which admin did them**. That accountability matters as your team grows.
- Kept for 180 days, then removed automatically. You can change this with `DIXLAB_EVENT_RETENTION_DAYS`.

### 8. System health: is everything working?

| What you see | What it tells you |
|---|---|
| API status and uptime | The server is running, and how long since it last restarted |
| Errors in the last 24 hours | Server errors, with each one's request path and status code. Full details stay in the server log. |
| Services | Whether AI is configured, which provider and model (Groq or Claude), with requests and failures in the last 24 hours. Whether email (SMTP or SendLiberty) is on. How many admins there are. |
| Database and upload sizes | How fast storage is growing |
| Record counts | Rows in each table |
| Versions | Python, FastAPI, SQLite, operating system |

**Use:** the first place to look when something seems broken. It tells you whether the problem is the server, AI or email.

---

## What changed behind the scenes

These changes were needed to power the dashboard. Each one is small and also useful on its own.

1. **Activity log.** A new `events` table records important actions: sign-ups, logins, failed logins, projects started and deleted, publishing, uploads, AI requests (success or failure), contact messages, server errors and admin actions.
   - **Why:** the database only held the *current state* (who exists, what's published). It had no history of *what happened*, and you can't chart growth, build a funnel or audit admins without one.
   - **Privacy:** it stores ids and small facts like a template name or a file size. It never stores passwords, login tokens or what people wrote.
2. **Daily page views.** Each view is now also counted per page, per day.
   - **Why:** before, there was only an all-time total, so you couldn't see views over time.
3. **Last active.** Each account now records when it last used the app. It's updated at most every 5 minutes, so it adds almost no load.
   - **Why:** this is what "active users" is based on. It's the honest measure of whether people come back.
4. **Admin and suspension fields** on accounts. Suspended users are blocked everywhere: logging in, using the app, their public pages and their contact forms.
5. **Error capture.** Server errors are recorded with their request path and status code, and visitors see a plain "something went wrong" message instead of a crash. AI "not configured" responses are tracked as AI events instead, so they don't show up as false alarms.
6. **Existing databases update themselves.** On start-up, the backend adds the new columns to an existing database. Your current accounts and projects are kept.
7. **Only admins download the dashboard code.** It's about 10 KB and loads only when someone opens `/admin`, so the app is no slower for everyone else.

---

## Tested

- **Automated backend tests** in `backend/tests/test_admin.py` (`test_admin_dashboard` and `test_admins_need_two_step_when_required`) cover:
  - Access: signed out → 401, regular user → 403.
  - The overview numbers and charts.
  - Search, the user page, CSV export, and messages showing no content.
  - Suspension: it signs the person out, blocks their login and hides their page, then unsuspending restores them.
  - The "not yourself" rules, granting and removing admin, and takedown.
  - Cleaning up unused uploads, the activity log filter, and system health.
  - Deleting an account, including the email confirmation.
  - Two-step login for admins: blocked without it, allowed with it, and `reset-2fa` from the terminal.
- **In Chrome**, with six test users and real activity:
  - Every section loads with no errors.
  - Chart hover and the table view work.
  - Suspend and unsuspend work.
  - A regular user is turned away.
  - No sideways scrolling on a phone.

## Worth adding later

- **Alerts:** a real-time "users online now" count, and an email to admins when errors spike.
- **Money:** plans and payments exist now (Bachs), so revenue, paying users per plan and cancellations are the next charts to add.
- **More detail on views:** where visitors come from and which countries. This needs a privacy-friendly analytics approach.
- **Admin roles:** for example "support", who can view and suspend but not delete, once there's a team.
- **On PostgreSQL**, if you move off SQLite later: the dashboard's database queries are standard, but a few use SQLite-specific functions. The date and JSON functions will need small changes during that move. Until then, keep the SQLite file on a persistent volume.
