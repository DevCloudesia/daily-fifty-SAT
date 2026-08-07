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
