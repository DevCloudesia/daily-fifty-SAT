# Daily Fifty architecture

## Request and rendering flow

1. `middleware.js` protects `/practice` and `/api/sync` with the signed `df_auth` cookie.
2. `app/practice/page.js` provides the stable practice page structure.
3. `app/practice/practice.css` provides the complete visual system for that structure.
4. `public/practice-app.js` loads a daily plan, requests questions, renders answers, runs the timer,
   and updates progress without reloading the page.
5. `app/api/index/route.js` loads question ID buckets.
6. `app/api/question/route.js` proxies normalized question data.
7. `app/api/sync/route.js` proxies shared progress to the Supabase `daily-fifty-sync` Edge Function.

## Canonical file map

| Area | Canonical files | Build or runtime role |
| --- | --- | --- |
| Practice structure | `app/practice/page.js` | Server-rendered stable shell |
| Practice visuals | `app/practice/practice.css` | Complete route stylesheet |
| Browser runtime | `public/practice-app.js` | Rendering and interaction |
| Math notation | `public/notation.js` | Repairs SAT markup before display |
| Question queue | `public/queue.js` | Builds sets and excludes seen IDs |
| Answer parsing | `public/answers.js` | Accepts SAT grid-in equivalents |
| Calculator layout | `public/calculator-layout.js` | Clamps and resizes Desmos split |
| Cloud merge | `public/cloud-sync.js` | Silent, reload-free progress merge |
| Homepage visuals | `assets/homepage.css` | Copied to `app/globals.css` at build |
| CSS source guard | `scripts/assets.mjs` | Rejects missing committed assets |
| CSS output guard | `scripts/verify-css-build.mjs` | Rejects incomplete compiled bundles |

## Styling invariants

- Practice CSS is fully committed in `app/practice/practice.css`.
- The timer SVG has inline dimensions and `fill="none"`, plus CSS stroke rules.
- Previous, Desmos, and Skip use explicit grid columns.
- The answer card and question column share the same first grid-row height.
- Header and answer cards scroll normally so they cannot cover the explanation.
- MathML uses native rendering with SAT-specific normalization.

## Deployment model

- GitHub feature branches create Vercel preview deployments.
- GitHub CI runs tests and the full production build.
- A reviewed preview is merged into `main`.
- The exact reviewed Vercel deployment is promoted to the production alias.
- Supabase Edge Functions deploy separately and must not be redeployed for CSS-only changes.

## Recovery checklist

If production loses styling:

1. Promote the last known-good Vercel deployment.
2. Confirm `daily-fifty.vercel.app` points to that deployment.
3. Check `app/practice/practice.css` for the required base selectors.
4. Run `npm test` and `npm run build`.
5. Verify a preview before promoting again.

Do not scrape CSS from production. That repeats the failure by making deployment state more
authoritative than Git history.
