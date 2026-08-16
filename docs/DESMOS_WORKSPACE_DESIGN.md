# Desmos workspace redesign

This document defines the layout and state model before implementation. It supersedes the first nested-split preview in PR #6.

## Problem

The first preview keeps Desmos inside the question card. That protects the initial layout, but dragging still changes the width of the content box that contains the SAT stem. At narrow split ratios, table cells and text can become visually clipped or compressed enough to hide meaningful digits.

The fix should make Desmos a peer workspace, not a child of the question content.

## Desktop layout

### Desmos closed

Keep the current production structure and proportions:

```text
┌──────────────────────────────┬──────────────────────┐
│ Question toolbar + question  │ Answer panel         │
│                              │ vertical choices     │
└──────────────────────────────┴──────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Explanation, only after reveal/submission           │
└─────────────────────────────────────────────────────┘
```

The question stays in the current left column. The answer card stays in the current right column. The explanation remains a separate full-width card.

### Desmos open

Switch to a two-pane study workspace above a full-width answer card:

```text
┌──────────────────────────────┬─┬──────────────────────────────┐
│ Question pane                │││ Desmos pane                  │
│ toolbar                      │││ calculator header            │
│ SAT stem                     │││ College Board calculator     │
│ Previous / Hide / Skip       │││                              │
└──────────────────────────────┴─┴──────────────────────────────┘
                         draggable divider

┌────────────────────────────────────────────────────────────────┐
│ YOUR ANSWER                                      question count │
│                                                                │
│ ┌──────────────────────────┐  ┌──────────────────────────┐      │
│ │ A                        │  │ B                        │      │
│ └──────────────────────────┘  └──────────────────────────┘      │
│ ┌──────────────────────────┐  ┌──────────────────────────┐      │
│ │ C                        │  │ D                        │      │
│ └──────────────────────────┘  └──────────────────────────┘      │
│                                                                │
│ feedback / check / reveal / complete                           │
│                                                                │
│                                                                │
│ EXPLANATION                                                    │
│ Why it works                                                   │
│ rationale content                                              │
└────────────────────────────────────────────────────────────────┘
```

The default top split is exactly 50/50. The answer panel does not consume horizontal space from either the question or Desmos while the calculator is open.

## DOM structure

Use one `study-split` wrapper around the question column, visible workspace divider, and calculator. The wrapper is `display: contents` while Desmos is closed so the existing question/answer desktop grid remains unchanged. When Desmos opens, the wrapper becomes the full-width top study grid.

```text
main#practiceWorkspace.workspace
  div#studySplit.study-split
    section.question-column
      question toolbar
      question panel
        questionStage
          questionCard
        navigation controls
    div#workspaceDivider
    aside#calculatorPane
  aside#answerColumn.answer-column
    section#answerCard.answer-card
      answer header
      answerArea
      feedback
      actions
      retire note
      div#answerExplanationSlot
  div#workspaceExplanationSlot
    section#explanationCard
```

The calculator iframe is never mounted inside `questionStage` again.

The existing practice runtime still owns calculator open/close state and iframe loading. A small layout module mirrors that existing active state onto the new workspace. The old nested divider is retained only as an invisible compatibility hook so the current runtime does not need a risky full-file rewrite in the same release.

## Split sizing and dragging

Desktop first-open ratio: `50%` question / `50%` calculator.

Hard content floors:

- question pane minimum: 500 px
- Desmos pane minimum: 420 px
- divider: 14 px

The visible workspace divider derives its drag bounds from the live `studySplit` width. It cannot move far enough to violate either minimum. CSS repeats the same limits with `clamp()` and `minmax()` so stale local storage or a JavaScript failure cannot collapse either pane.

At widths where both minimums cannot fit comfortably, the study area stacks vertically instead of squeezing. The stacked breakpoint is 1000 px. In stacked mode the resize handle is removed and both panels use their natural readable heights. This is safer than using a vertical drag control that can clip a long SAT stem.

Keyboard behavior on desktop:

- Left/Right arrows resize
- Home: smallest safe question share
- End: largest safe question share
- `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` are updated from the live safe bounds

## Answer behavior

When Desmos is closed, multiple-choice answers keep the current vertical list.

When Desmos is open on desktop, multiple-choice answers use a 2 by 2 grid. Each choice retains the existing pill style, letter marker, crossing-out control, selected/correct/incorrect states, and typography.

Grid-in questions never become a two-column grid. Their input stays full width.

At narrow widths, multiple-choice answers return to one column even if Desmos is open.

## Explanation behavior

There is one explanation DOM node and one rationale payload. No duplicate explanation markup is created.

When Desmos is closed, the explanation node lives in `workspaceExplanationSlot` and behaves exactly like the current full-width explanation card.

When Desmos is open and the answer is revealed, the same explanation node is moved into `answerExplanationSlot` at the bottom of the answer card. In embedded mode it loses the nested card border/shadow but keeps:

- `EXPLANATION` eyebrow
- `Why it works` heading
- collapse control
- Georgia rationale typography
- MathML rendering

A generous separator and blank vertical space distinguish the answer controls from the explanation.

Closing Desmos after submission moves the explanation back to the external full-width slot. Reopening Desmos moves it back into the answer card. The rationale is never duplicated.

## State model

The existing practice calculator state remains the source of truth for open/close and iframe loading. The layout module observes the runtime's active `questionStage` class and does not create a second calculator-open state.

The new workspace split ratio uses its own versioned preference key so the old 56% preview ratio cannot override the new 50/50 default. Existing question progress and music preferences are untouched.

The Desmos iframe remains mounted once loaded, so calculator expressions survive question navigation and layout changes.

## CSS state classes

`workspace.calculator-open` controls the overall mode.

`study-split.workspace-resizing` temporarily disables iframe pointer events while dragging.

The answer grid uses `:has(.choice)` so only multiple-choice content switches to 2 by 2 layout. Grid-in content remains full width.

`explanation-card.embedded` removes nested card chrome when the explanation is inside the answer card.

## Regression requirements

Tests must verify:

1. Desmos is a sibling of the question column, not a child of `questionStage`.
2. The default split is 50/50.
3. Live drag bounds enforce both pixel minimums.
4. The answer column becomes full width while Desmos is open.
5. Multiple-choice answers become 2 by 2 only in open desktop mode.
6. Grid-in answers stay full width.
7. One explanation node moves between the workspace slot and answer slot.
8. Closing and reopening Desmos after reveal moves the explanation without duplication.
9. The iframe remains mounted and keeps its state.
10. Mobile/stacked mode does not horizontally squeeze either pane.
