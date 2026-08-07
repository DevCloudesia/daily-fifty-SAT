# Daily Fifty coding instructions

These rules apply to every automated or human coding session in this repository.

## Source of truth

- Edit `app/practice/practice.css` for the complete practice interface. It is the canonical full
  stylesheet, not an override layer.
- Edit `app/practice/page.js` for practice markup.
- Edit `public/practice-app.js` for question rendering, navigation, timers, answers, and browser
  interaction.
- Edit `assets/homepage.css` for homepage styles. The build copies it to `app/globals.css`.
- Edit `public/notation.js`, `public/queue.js`, and `public/cloud-sync.js` for notation, no-repeat
  planning, and shared progress respectively.
- Never edit `.next` or treat a deployed Vercel bundle as source code.

## Required workflow

1. Add every requested item to `todo.md` before editing.
2. Preserve unrelated worktree changes.
3. Run `npm test` and `npm run build` after changes.
4. Publish a preview branch and verify the actual Vercel deployment.
5. Merge only after visual approval.
6. Promote the exact verified deployment instead of creating a fresh production build.
7. Check completed `todo.md` items before the final commit.

## CSS safety

- `app/practice/practice.css` must retain the complete layout, responsive rules, component states,
  calculator split, loading UI, and timer SVG guards.
- `scripts/assets.mjs` validates the committed practice source before development and builds.
- `scripts/verify-css-build.mjs` validates the compiled CSS output.
- Do not remove those checks to make a failing build pass. Repair the missing source.
- A plain page or giant black timer circle means the practice stylesheet is missing. Roll back the
  production alias first, then repair the committed stylesheet.

## Production snapshot warning

`npm run snapshot:legacy` is not a normal build step. It is blocked unless
`ALLOW_PRODUCTION_SNAPSHOT=1` is set, only copies three public JavaScript files, and never copies
CSS. Production can be older than the branch, so review the complete diff after any use.
