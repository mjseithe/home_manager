# Home Manager

A household dashboard for the Seither family: shared Google calendars with email
reminders, a shared grocery list, and per-person chore tracking for Mark, Liz,
Harlow, Violet, and Josie. Built to run on a Raspberry Pi wired to a kitchen
touchscreen, and also reachable from any phone on the home network.

- **Stack**: SvelteKit (TypeScript, Node adapter) + SQLite (Drizzle ORM) + Tailwind
- **Requires Node 22+** (see `.nvmrc`) — `better-sqlite3` needs it.

## Local development

```sh
nvm use            # picks up Node 22 from .nvmrc
npm install
cp .env.example .env   # then fill in the values below
npm run db:migrate
npm run db:seed        # creates the 5 family member profiles + default reminders
npm run dev
```

Open http://localhost:5173 — you'll land on the profile picker.

Useful scripts:

- `npm run check` — typecheck (svelte-check)
- `npm run db:studio` — browse the SQLite database in Drizzle Studio
- `npm run db:generate` — generate a migration after editing `src/lib/server/db/schema.ts`

## Configuring `.env`

### Google Calendar (OAuth)

Each parent connects their own Gmail calendar from the Calendar tab
("+ Connect a Google Calendar", under "Manage connected calendars"). To enable
that button you need a Google Cloud OAuth client:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create a
   project (or reuse one).
2. **APIs & Services → Library** → enable the **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → set it up as "External" (or
   "Internal" if you use Google Workspace), add yourself and your spouse as
   test users if the app stays in "Testing" mode (fine for a household app —
   no need to publish/verify it).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
   application type "Web application".
5. Under "Authorized redirect URIs" add exactly the URL this app will use,
   e.g. for local dev: `http://localhost:5173/calendar/connect/callback`.
   For the Pi in production, add its address too, e.g.
   `http://homepi.local:3000/calendar/connect/callback` (see `DEPLOY.md`).
6. Copy the generated **Client ID** and **Client secret** into `.env` as
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_REDIRECT_URI`
   to whichever redirect URI matches where you're currently running the app.

### Email reminders (SMTP)

Reminder emails are sent via plain SMTP using [nodemailer](https://nodemailer.com/).
The simplest option is a Gmail account with an **app password**:

1. Turn on 2-Step Verification on the sending Gmail account.
2. Create an [app password](https://myaccount.google.com/apppasswords) for "Mail".
3. Set in `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-address@gmail.com
   SMTP_PASS=the 16-character app password
   SMTP_FROM="Home Manager <your-address@gmail.com>"
   ```

Then, in the app's **Settings** tab, set each family member's reminder email
address and adjust the reminder rules (defaults: 1 day before and 1 hour
before, for everyone).

## How it works

- **Profiles**: tapping a name on the picker sets a cookie for "who's using
  this session" — no passwords, just for attributing grocery/chore actions.
- **Calendar sync**: runs automatically every 15 minutes in the background
  (see `src/lib/server/scheduler.ts`), plus a manual "🔄 Sync" button on the
  Calendar page. Only a rolling window (1 day back, 60 days ahead) is synced.
- **Reminders**: checked every 5 minutes; an email goes out once per
  event/rule combination (tracked in the `event_reminder_log` table so
  reminders never duplicate).

For running this on the actual Raspberry Pi + touchscreen, see
[`DEPLOY.md`](./DEPLOY.md).
