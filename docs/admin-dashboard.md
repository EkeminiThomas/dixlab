# Admin dashboard: what was built and why

The admin dashboard lives at **`/admin`**. It is where the people who run Dixlab watch the product grow, see what users are doing, and handle problems, all without touching the database.

## Getting in

1. Sign up in the app with your normal email and password.
2. In a terminal, in the `backend` folder, run:
   ```
   .venv\Scripts\python -m app.admin_cli grant you@example.com
   ```
   `... list` shows the current admins; `... revoke` removes one (never the last).
3. Log in. Admins land straight on the admin dashboard. From there you can make other people admins from their user page.

**Why the terminal, not a sign-up setting:** Dixlab doesn't verify email addresses, so an "admin email" setting would let whoever signs up first with that address become admin. Only someone with access to the server can run the command, and every grant is recorded in the activity log.

**The server checks admin rights on every request.** Hiding the dashboard from regular users isn't the only protection, and a regular user who opens `/admin` sees "Admins only".

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
| Services | Whether AI (Claude) is configured, with requests and failures in the last 24 hours. Whether email (SMTP) is on. How many admins there are. |
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

- **An automated backend test** (`test_admin_dashboard`, now 13 tests in total) covers:
  - Access: signed out → 401, regular user → 403.
  - The overview numbers and charts.
  - Search, the user page, CSV export, and messages showing no content.
  - Suspension: it signs the person out, blocks their login and hides their page, then unsuspending restores them.
  - The "not yourself" rules, granting and removing admin, and takedown.
  - Cleaning up unused uploads, the activity log filter, and system health.
  - Deleting an account, including the email confirmation.
- **In Chrome**, with six test users and real activity:
  - Every section loads with no errors.
  - Chart hover and the table view work.
  - Suspend and unsuspend work.
  - A regular user is turned away.
  - No sideways scrolling on a phone.

## Worth adding later

- **Alerts:** a real-time "users online now" count, and an email to admins when errors spike.
- **Money**, once custom domains or plans exist: revenue, paying users, cancellations.
- **More detail on views:** where visitors come from and which countries. This needs a privacy-friendly analytics approach.
- **Admin roles:** for example "support", who can view and suspend but not delete, once there's a team.
- **On PostgreSQL** (needed for hosting on Pxxl): the dashboard's database queries are standard, but a few use SQLite-specific functions. The date and JSON functions will need small changes during that move.
