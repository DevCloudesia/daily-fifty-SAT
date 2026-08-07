# The Daily Fifty

A focused SAT practice app that generates one daily set of 50 questions:

- 25 hard Reading and Writing questions
- 5 Words in Context questions
- 20 hard Math questions
- a 60-second timer with overtime tracking
- permanent no-repeat history from the moment a question is shown
- shared phone and computer progress through Supabase

Production: https://daily-fifty.vercel.app

## Stack

- Next.js 15
- React 19
- Vercel
- Supabase Postgres and Edge Functions

## Start here

The committed repository is the source of truth. Do not reconstruct the app from a Vercel
deployment or from `.next` build output.

| What you are changing | Canonical file |
| --- | --- |
| Practice page structure | `app/practice/page.js` |
| Complete practice styling | `app/practice/practice.css` |
| Practice behavior and rendering | `public/practice-app.js` |
| Math notation normalization | `public/notation.js` |
| No-repeat question planning | `public/queue.js` |
| Cross-device sync behavior | `public/cloud-sync.js` |
| Homepage styling | `assets/homepage.css` |
| Login styling | `app/login/login.css` |
| Production CSS safeguards | `scripts/assets.mjs` and `scripts/verify-css-build.mjs` |

`app/practice/practice.css` must contain the full practice interface. It is not an override file
and must never be replaced with a small set of production refinements. The build fails when its
required selectors, minimum size, or timer SVG safety rules disappear.

For a deeper route and data-flow map, read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Future coding sessions must also follow [`AGENTS.md`](AGENTS.md).

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
DAILY_FIFTY_SITE_PASSWORD=
```

Never commit the real sync key or site password. Store `DAILY_FIFTY_SYNC_KEY` in Vercel and in the
Supabase Edge Function secret of the same name. `DAILY_FIFTY_SITE_PASSWORD` only needs to exist in
Vercel.

## Site password gate

`middleware.js` blocks `/practice` and `/api/sync` behind a single shared password, checked
against `DAILY_FIFTY_SITE_PASSWORD`. There are no user accounts - anyone with the password sees
the same shared progress, matching how sync already works. Signing in at `/login` sets an
HttpOnly, signed cookie (`df_auth`, ~180 days) computed as an HMAC of the password; the cookie
itself never contains the password. If `DAILY_FIFTY_SITE_PASSWORD` is unset, the gate fails
**closed** - `/practice` and `/api/sync` become unreachable rather than unprotected - so the
variable must be set before this deploys, not after.

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

## Safe change workflow

1. Add the requested work to `todo.md`.
2. Edit the canonical files listed above.
3. Run `npm test`.
4. Run `npm run build`.
5. Push a feature branch and inspect the Vercel preview.
6. Merge only after the preview is visually verified.
7. Promote the exact verified deployment. Do not rebuild a different artifact for production.

GitHub CI repeats the test and production-build checks for every pull request and every push to
`main`. Vercel Git integration creates previews from non-production branches.

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

Completed question IDs are permanently stored in `daily_fifty_question_history`. Seen question IDs are kept in the canonical append-only sync payload, so a question that appears on one device is excluded from future plans on every device. Daily plans and per-question answer state are stored in normalized date-based tables. The sync function merges device progress without allowing a newer empty session to erase a richer unfinished session or reloading the practice page.

## Canonical production assets

`main` contains the canonical browser runtime and stylesheets. Normal development and builds
validate committed files and do **not** scrape the live `/practice` page. This prevents an old,
protected, or partially styled deployment from replacing current source.

There is a guarded legacy recovery command for the three public JavaScript assets only:

```bash
ALLOW_PRODUCTION_SNAPSHOT=1 npm run snapshot:legacy
```

Do not use it during normal work. It never downloads CSS. Review every changed line before
committing because production may be older than the branch. The real `DAILY_FIFTY_SYNC_KEY`
remains only in Vercel and Supabase environment settings.

## Production release

The production alias is `https://daily-fifty.vercel.app`. The safe release sequence is:

```bash
npm test
npm run build
vercel promote https://VERIFIED-PREVIEW-DEPLOYMENT.vercel.app \
  --scope leo-wangs-projects-81f92619 \
  --yes
vercel promote status --scope leo-wangs-projects-81f92619
```

Always record the verified preview commit and deployment URL in the pull request before merging.
If a release is visually broken, promote the last known-good deployment immediately, then repair
the source on a new preview. Never patch only the deployed bundle.

## SAT Question Bank access

The browser does not scrape individual pages from `satquestionbank.org`. It requests this app's
same-origin routes, and those routes use three upstream sources:

- `/api/index` downloads the main static ID buckets from
  `https://daily-fifty-fast-index.vercel.app/question-index.json`.
- `/api/index` also downloads one public SAT Question Bank set at
  `https://satquestionbank.org/start/353d15a80c6` and extracts its eight-character question IDs
  to identify the Words in Context pool.
- `/api/question?id=...` proxies the actual normalized question payload from
  `https://daily-fifty-api.vercel.app/api/question?id=...`. Each returned question includes its
  public `https://satquestionbank.org/question/<id>` source URL for attribution.

The source code for the two `daily-fifty-*.vercel.app` upstream services is not present in this
repository, so their collection process cannot be audited or changed here. This app only
consumes their JSON output and the public vocabulary-set HTML described above.

## Desmos calculator

Math questions expose a rounded **Desmos Calculator** control between Previous and Skip. It
loads the official College Board testing calculator only after the first click, keeps the iframe
mounted while navigating so calculator work is preserved, and hides the control on Reading and
Writing questions. The divider supports pointer dragging plus arrow, Home, and End keys. On
narrow screens the split stacks vertically so both the question and calculator remain usable.
