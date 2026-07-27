# The Daily Fifty

A focused SAT practice app that generates one daily set of 50 questions:

- 25 hard Reading and Writing questions
- 5 Words in Context questions
- 20 hard Math questions
- a 60-second timer with overtime tracking
- permanent no-repeat question history
- shared phone and computer progress through Supabase

Production: https://daily-fifty.vercel.app

## Stack

- Next.js 15
- React 19
- Vercel
- Supabase Postgres and Edge Functions

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required environment variables:

```text
DAILY_FIFTY_SYNC_URL=
DAILY_FIFTY_SYNC_KEY=
```

Never commit the real sync key. Store the same value in Vercel and in the Supabase Edge Function secret named `DAILY_FIFTY_SYNC_KEY`.

## Finding the sync key in Vercel

The production key is stored as a protected Vercel environment variable, not in this repository.

1. Open the Vercel dashboard.
2. Select the **daily-fifty** project.
3. Open **Settings → Environment Variables**.
4. Search for `DAILY_FIFTY_SYNC_KEY`.
5. Use the variable's reveal or copy control. Vercel may ask you to reauthenticate, and your team role must allow access to environment-variable values.

To pull the project's environment variables into a local file with the Vercel CLI:

```bash
vercel link
vercel env pull .env.local --environment=production
```

Then inspect `DAILY_FIFTY_SYNC_KEY` inside `.env.local`. That file is ignored by Git. Do not paste the key into an issue, commit, screenshot, or public chat.

The matching Supabase secret can be set with:

```bash
supabase secrets set DAILY_FIFTY_SYNC_KEY="your-key" --project-ref YOUR_PROJECT_REF
```

## Source snapshot

The Next.js project is complete, while the large browser assets are snapshotted from the current production deployment by `scripts/assets.mjs`. Run:

```bash
npm run snapshot
```

This refreshes `public/practice-app.js`, `public/queue.js`, `public/answers.js`, and the current CSS files before a build. The snapshot process is idempotent and preserves the shared-database sync code.

## Repository layout

- `app/`: Next.js pages and server routes
- `public/`: browser-side practice, queue, and answer logic
- `scripts/`: production source snapshot and no-repeat patching
- `supabase/functions/`: Edge Functions, with secrets read from environment variables
- `supabase/migrations/`: normalized progress schema

## Supabase setup

Apply the SQL migration, set the function secret, and deploy the functions:

```bash
supabase db push
supabase secrets set DAILY_FIFTY_SYNC_KEY="your-key"
supabase functions deploy daily-fifty-sync --no-verify-jwt
supabase functions deploy daily-fifty-classify --no-verify-jwt
supabase functions deploy daily-fifty-vocab --no-verify-jwt
```

**Set the secret before deploying.** `daily-fifty-sync` and `daily-fifty-classify` both read
`DAILY_FIFTY_SYNC_KEY` from the environment and reject every request when it is unset, so
deploying without the secret in place takes sync down until it is set. The value must match the
`DAILY_FIFTY_SYNC_KEY` stored in Vercel, which is what the `/api/sync` proxy sends.

`daily-fifty-sync` and `daily-fifty-classify` use custom `x-daily-fifty-key` authentication.
`daily-fifty-vocab` is a public read-only data endpoint. `daily-fifty-classify` holds the service
role and fans each call out to 150 upstream requests, so it is invoked with the key:

```bash
curl -H "x-daily-fifty-key: your-key" \
  "https://YOUR_PROJECT.supabase.co/functions/v1/daily-fifty-classify?offset=0&limit=100"
```

## Sync protocol

`POST /api/sync` merges a device payload and writes the result. `GET /api/sync` is a pure read:
it forwards `{"mode":"read"}`, which returns the merged view without touching any table. Sending
a write on every page load was upserting the session, every answer row, and the whole retirement
history each time.

## Progress model

Completed question IDs are permanently stored in `daily_fifty_question_history`. Daily plans and per-question answer state are stored in normalized date-based tables. The sync function merges device progress without allowing a newer empty session to erase a richer unfinished session.
