# Terminal Inline Completion P0 Design

## Goal

Upgrade the current terminal suggestion experience from `history search + floating overlay` to a Warp-like inline completion interaction:

- show ghost text directly after the user's current input
- accept the suggestion with `Tab`
- keep the current suggestion source based on local command history
- avoid introducing shell integration or AI prediction in P0

This P0 intentionally focuses on interaction shape and state correctness first. Prediction quality can be upgraded later without replacing the rendering and input-state foundations.

## Current State

The current implementation behaves as follows:

- terminal input is tracked through a coarse `inputBuffer`
- suggestions are fetched by querying command history after a short debounce
- the server returns history records ranked by frecency
- the client shows only the top prefix-matching result
- suggestion UI is rendered as a separate overlay
- `Tab` accepts the remaining suffix and sends only that suffix to the remote shell

Relevant files:

- `src/features/workbench/useSshTerminalRuntime.ts`
- `src/features/workbench/sshTerminalRuntimeModel.ts`
- `src/features/workbench/SshTerminalSuggestionOverlay.tsx`
- `server/commandHistoryStore.ts`
- `server/http/commandRoutes.ts`

## Problem

The current floating suggestion box is functionally useful but interaction-wise it is not the right abstraction:

- it is visually detached from the command line
- it can obscure the user's current input near the bottom of the viewport
- it does not feel like command continuation
- it does not create a clean foundation for future AI-assisted completion

The real gap is not the suggestion source. The real gap is the absence of:

- an explicit editable terminal input state
- a cursor-aware inline rendering model

## Scope

### In Scope

- replace the detached suggestion overlay with inline ghost text
- preserve current command-history-based suggestion source
- keep `Tab` as the accept action
- support conservative hide/show behavior when state is uncertain
- keep compatibility with existing paste, copy, search, and session behaviors

### Out of Scope

- shell integration for `zsh/bash/fish`
- prompt protocol changes
- multi-line command completion
- completion inside mid-line edits
- AI-based prediction
- token-wise partial accept behavior

## Approaches Considered

### Approach A: Keep floating overlay and only improve positioning

Pros:

- smallest implementation
- minimal risk to terminal rendering

Cons:

- does not achieve Warp-like experience
- remains visually separate from the input line
- still the wrong foundation for future inline completion

Decision: reject.

### Approach B: Inline ghost text without shell integration

Pros:

- reaches the intended interaction shape
- fits current architecture with bounded changes
- keeps prediction source unchanged
- creates a reusable rendering/state layer for future AI completion

Cons:

- must conservatively hide completion in ambiguous shell states
- not as robust as full shell integration

Decision: adopt for P0.

### Approach C: Full shell integration first

Pros:

- highest correctness ceiling
- best long-term parity with Warp-like products

Cons:

- much higher implementation cost
- requires startup protocol and shell hook changes
- too broad for current stabilization work

Decision: defer to P1+.

## Recommended Design

P0 will be implemented as three separable layers.

### 1. Input State Layer

Introduce an explicit terminal input state model instead of relying only on a plain `inputBuffer`.

Target state:

- `buffer`: current editable text
- `cursorOffset`: cursor position relative to the editable buffer
- `isEditable`: whether the current terminal line is safe for inline completion
- `isMultiline`: whether the input has become multi-line or otherwise ambiguous
- `suggestion`: full suggested command
- `suggestionSuffix`: the suffix shown as ghost text

Rules:

- only show completion when cursor is at line end
- hide completion on ambiguous ANSI/edit states
- clear completion on `Enter`, `Ctrl+C`, `Ctrl+U`, `Esc`-driven uncertain transitions, and prompt-invalidating output
- degrade to hidden state rather than displaying a potentially incorrect inline suggestion

### 2. Suggestion Layer

Keep the current history-backed completion service, but formalize it as a dedicated inline completion model.

Lookup order:

1. node-scoped history matches
2. global history matches
3. frecency ordering inside each bucket

Acceptance rules:

- suggestion must strictly extend the current input
- suggestion must prefix-match the current buffer
- only the suffix is rendered

Example:

- input: `git che`
- suggestion: `git checkout main`
- rendered ghost text: `ckout main`

This keeps the current backend stable while isolating the client-side decision logic for future replacement by mixed local + AI predictors.

### 3. Rendering Layer

Replace the detached suggestion box with inline ghost text rendered relative to the terminal cursor.

Implementation direction:

- render an absolutely positioned inline completion component inside `SshTerminalPane`
- calculate its x/y placement from terminal cursor position and viewport metrics
- use terminal font family, size, and line height so the ghost text visually aligns with the active command line
- render only the suffix, in subdued color

This is not a true xterm core modification. It is a cursor-synchronized visual overlay that behaves like inline continuation from the user's perspective.

## Behavior Rules

### Show Completion Only When

- input buffer is non-empty
- terminal is in a known editable state
- cursor is at end of current editable buffer
- suggestion exists and strictly extends current buffer
- no selection is active
- input is not currently multi-line

### Hide Completion When

- `Enter` is pressed
- `Ctrl+C` clears the command
- `Ctrl+U` or `Ctrl+W` mutates the line in a way that invalidates suggestion state
- arrow-key or escape-sequence behavior makes cursor position uncertain
- remote output redraws or invalidates the current prompt area
- selection is active
- completion source no longer prefix-matches

### Accept Completion

- `Tab` accepts the current suffix
- only the remaining suffix is sent to the remote shell
- local input state updates to the full completed command

## Architecture Changes

Recommended module split:

- `src/features/workbench/sshTerminalInputModel.ts`
  - pure state transitions for editable input tracking
- `src/features/workbench/sshTerminalInlineCompletionModel.ts`
  - pure logic for completion eligibility, suffix derivation, and visibility
- `src/features/workbench/SshTerminalInlineCompletion.tsx`
  - ghost text rendering component
- `src/features/workbench/useSshTerminalRuntime.ts`
  - orchestration only; delegates state decisions to models
- `src/features/workbench/SshTerminalPane.tsx`
  - composition and cursor-based positioning only

This keeps runtime orchestration smaller and makes behavior testable outside the DOM.

## Data Flow

1. user types into terminal
2. runtime normalizes key/input event into input-state transition
3. updated state emits a suggestion query when safe
4. history search returns ranked suggestions
5. inline completion model picks one valid suggestion and derives suffix
6. pane computes cursor-relative render position
7. ghost text is rendered inline
8. user accepts with `Tab` or invalidates with subsequent editing/output

## Error Handling and Degradation Strategy

P0 must prefer correctness over aggressiveness.

If any of the following becomes uncertain, the system should hide completion instead of guessing:

- true prompt boundary
- mid-line cursor position
- remote redraw semantics
- multi-line editing
- shell-specific interactive widgets

This ensures that P0 improves interaction without creating command corruption risk.

## Testing Strategy

### Model Tests

- printable input updates `buffer` and `cursorOffset`
- backspace updates state correctly
- `Enter` clears editable completion state
- `Tab` accepts suffix and returns correct forwarded input
- line-clearing controls invalidate suggestion state
- invalid prefix matches are rejected

### Rendering/Placement Tests

- inline completion renders suffix only
- overlay aligns with terminal font metrics
- completion stays visible when cursor is in safe space
- completion hides or repositions safely when state becomes invalid

### Regression Coverage

- does not break copy/paste flows
- does not break search overlay
- does not break context menu behavior
- does not break terminal session execution paths

## Limitations After P0

After this design is implemented, the UX will feel much closer to Warp, but it will still not be equivalent.

Known remaining gaps:

- no shell integration
- no prompt-aware protocol
- no AI prediction
- conservative hiding on ambiguous editing states
- no token-wise accept behavior

These limitations are acceptable for P0 because the objective is to lock down the correct interaction model and safe state boundaries first.

## Follow-Up Path

After P0 is stable, the next recommended evolution is:

1. shell integration for prompt/input boundary fidelity
2. mixed predictor stack: local history + shell context + AI completion
3. richer accept behaviors such as token accept or right-arrow accept

P0 should therefore be treated as the interaction and architecture foundation, not the final completion system.
