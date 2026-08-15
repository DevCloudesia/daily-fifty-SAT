# Practice experience fixes

- [x] Reproduce and trace the malformed math notation shown in question text and answer choices.
- [x] Implement complete SAT math notation rendering with safe fallback behavior.
- [x] Replace the black circular question-loading screen with a polished, accessible skeleton state.
- [x] Stop question navigation from refreshing or remounting the practice page.
- [x] Stop showing the "Progress merged" message whenever a new question loads.
- [x] Make seen questions persistently excluded so they never appear again.
- [x] Add regression coverage for notation rendering, loading, sync messaging, and no-repeat behavior.
- [x] Run lint/build/tests and manually verify the complete practice flow.
- [x] Publish the completed changes to GitHub.

## Embedded Desmos calculator

- [x] Document exactly how this app currently reaches SAT Question Bank content.
- [x] Verify whether the official College Board Desmos testing URL permits iframe embedding.
- [x] Add a rounded, math-only "Desmos Calculator" control between Previous and Skip.
- [x] Open the calculator inside the math question area without moving the answer choices.
- [x] Add a draggable divider that resizes the question and calculator panes.
- [x] Add keyboard resizing, accessible labels, close behavior, and responsive mobile behavior.
- [x] Preserve calculator state while moving among math questions and hide it on R&W questions.
- [x] Add regression tests for visibility, layout state, and resizing.
- [x] Build and verify the complete calculator flow before publishing.

## Production stylesheet recovery

- [x] Reproduce the unstyled production page and identify the giant timer SVG fallback.
- [x] Restore the complete base practice layout and component stylesheet.
- [x] Give timer SVG geometry and fill safe inline fallbacks.
- [x] Add build validation for required practice selectors and SVG safety.
- [x] Add regression tests for the restored stylesheet.
- [x] Run the full test and production-build checks.
- [x] Perform an authenticated visual/static smoke test of the practice route.
- [x] Publish a preview pull request and verify its deployment.
- [x] Promote only after the repaired preview is visually verified.

## Practice layout polish

- [x] Keep Previous and Skip on opposite sides when the English calculator control is hidden.
- [x] Let the top bar and answer card scroll away so they never cover the explanation.
- [x] Give long answer choices a calmer text treatment and more breathing room.
- [x] Add regression coverage for navigation placement and non-sticky explanation behavior.
- [x] Run tests and the production build.
- [x] Publish and verify a Vercel preview before production.

## Practice sizing and typography

- [x] Make Previous and Skip equal-width controls while keeping opposite alignment.
- [x] Stretch the answer card to match the full question toolbar and panel height.
- [x] Make answer choices true pill-shaped controls.
- [x] Match answer-choice typography to the question text font.
- [x] Add regression coverage for equal widths, matched heights, pill shapes, and typography.
- [x] Run tests and the production build.
- [x] Publish and verify the final Vercel preview.

## Repository handoff and production release

- [x] Document the canonical practice CSS and runtime file map in README.md.
- [x] Add AGENTS.md instructions so future coding sessions edit and verify the correct files.
- [x] Add a pull-request checklist that catches missing CSS and unsafe production promotion.
- [x] Add GitHub CI for tests and production-build validation.
- [x] Run all tests and the production build with the repository safeguards.
- [x] Publish and verify the documentation and CI preview.
- [x] Merge PR #3 into main.
- [x] Promote the exact verified main deployment to production.
- [x] Verify the production alias, deployment commit, and final build status.

## Responsive practice proportions

- [x] Remove unnecessary minimum height from short question cards.
- [x] Keep the question toolbar at one consistent desktop height, even beside long answers.
- [x] Give the answer panel a larger, stable share of the desktop workspace.
- [x] Preserve the stacked mobile layout and calculator split behavior.
- [x] Add regression coverage for the fixed toolbar and revised column proportions.
- [x] Run tests and the production build before publishing.
- [x] Publish a preview for visual approval before production.
- [x] Complete authenticated visual verification of the preview before merge and production.
- [x] Increase the desktop answer panel to roughly 40% for long choices.
- [x] Re-run proportion tests, production build, and preview checks.

## Answer submission integrity

- [x] Preserve the exact answer selected by the user when checking a question.
- [x] Show the correct answer separately without changing the selected answer.
- [x] Match explanation body typography to the Georgia question and choice font.
- [x] Add regression coverage for selection integrity and explanation typography.
- [x] Run tests, production build, and preview deployment checks.

## Final production promotion and repository cleanup

- [x] Merge the approved PR #4 into `main` using the verified head commit.
- [x] Verify GitHub `main` contains the latest practice code and documentation.
- [x] Verify the release does not reset or delete current-day or historical progress.
- [x] Publish the verified `main` commit to the production website.
- [x] Verify the production alias, deployed commit, build status, and runtime errors.
- [x] Delete stale merged feature branches so the repository keeps only current work.

## Desmos readability and placement bugfix

- [ ] Reproduce the desktop squeeze that clips SAT question digits when Desmos is open.
- [ ] Prevent the question pane from shrinking below a readable minimum width.
- [ ] Rebalance the calculator placement so the complete question remains visible at common desktop widths.
- [ ] Keep the draggable divider without allowing users to resize into an unreadable question pane.
- [ ] Preserve the mobile stacked calculator behavior.
- [ ] Add regression coverage for minimum question width and safe resize limits.
- [ ] Run tests and the production build.
- [ ] Publish a preview deployment for visual approval before production.
