# Implementation Plan — Dual Answers, Sticky Reading, Session History

> **Status:** 🟡 Planning only — implementation has not started.
> **Owner:** Ayush
> **Scope:** Dual answer modes, answer reading/scroll behavior, and persistent per-run Q&A history.
> **Explicitly deferred:** Feature 3 (candidate-mic/readback question detection). Do not change it in this implementation.

---

## 1. Goal and agreed requirements

### A. Two answer styles for each detected question

- **Simple answer:** answer the current question directly, with no preceding interview Q&A context. It should be the fast result and should not be distorted by an unrelated previous answer.
- **Contextual answer:** answer the latest question as the main focus, with the preceding **four chat messages** available as context. The model should decide in this same answer call whether those prior messages are relevant (follow-up) or should be ignored (standalone question). Do **not** add a separate classifier request.
- When both are requested, begin both requests in parallel. Stream the Simple result into the UI immediately as it arrives; do not wait for the Contextual result. Show the Contextual result as it arrives, even if it takes longer.
- Provide a clear choice to request **Both**, **Simple only**, or **Contextual only**. Default to **Both**. A one-answer choice should skip the other API request rather than generate and discard it.
- Each result must have its own streaming, completion, and error state. Failure of one must not erase or block the other.

### B. Keep the answer readable while it streams

- Start each newly selected question at the top of its answer area.
- Do not move the reader's scroll position while new chunks arrive.
- Keep manual scrolling under the user's control; do not auto-follow the bottom.
- Remove the current nested-scroll behavior so one well-defined container owns vertical scrolling.

### C. Persistent History section

- Keep a durable, local-only record of the Q&A for each **new app run**.
- Add a separate History view where Ayush can browse prior runs, open a run, and inspect its questions and Simple/Contextual answers.
- Keep live questions in the existing Live view; do not mix historical records into the live Zustand list.
- Reuse the existing local JSON persistence and `StorageManager`; do not add a database or dependency for this feature.
- Preserve and display existing daily answer files as legacy history. Do not delete or rewrite them just to migrate.

### D. Explicitly out of scope

- **Feature 3:** detecting/ignoring candidate speech while the candidate reads the generated answer. No mic detection, detector, source-routing, suppression-window, or echo changes in this work.
- Adding or replacing Groq model IDs, editing `modelStrategy.ts`, or claiming today's model access is verified. Reuse only IDs already wired in the project; model/network availability is a separate blocked follow-up.
- Transcript-history browser, export/import, cloud sync, or any remote storage. The request is Q&A history, not a complete audio/transcript archive.

---

## 2. Repository findings that shape the design

1. **Context is currently forced onto every answer.** [`electron/llmEngine.ts`](electron/llmEngine.ts) constructs each request from a single `conversationHistory.slice(-6)`. Even a standalone question receives past Q&A.
2. **Current history is not a durable session model.** `LLMEngine` keeps one in-memory array and clears it on `refresh-session`. It is updated as a user message at request start and an assistant message at stream completion, so simultaneous requests can interleave or expose an incomplete pair.
3. **The current persisted “session” is actually a calendar-day bucket.** [`electron/storageManager.ts`](electron/storageManager.ts) writes `answers/session_YYYY-MM-DD.json`, uses that date as `sessionId`, and appends all same-day launches to the same file. It cannot distinguish individual app starts.
4. **There is no history-loading path or History UI today.** The app saves answers after generation, but no method lists/loads saved answer files into the renderer. `saveTranscriptEntry()` exists, but inspection found no call site; transcript history is not part of this request.
5. **An answer is not persisted until its generation finishes.** A crash can leave no durable record of a question that was already detected. The new design should persist the question and answer statuses before streaming starts, then persist results on completion/failure.
6. **“Regenerate” currently starts a new question.** [`electron/ipcHandlers.ts`](electron/ipcHandlers.ts) calls the ordinary new-question path, which creates a fresh ID and appends another list entry. A two-answer UI/history would make this more confusing; regenerate must target and replace/revise the selected question's requested answer, not create a second interview question.
7. **The answer scroll is actively forced to the bottom for each chunk.** [`src/components/AnswerPanel/AnswerDisplay.tsx`](src/components/AnswerPanel/AnswerDisplay.tsx) sets `scrollTop = scrollHeight`; CSS also defines overflow on both `.answer-content` and `.answer-display`.
8. **This repository has pre-existing local edits.** `git status` showed many modified and untracked files, including answer, main-process, settings, and UI files. Before implementation, inspect the then-current diff and preserve the user's existing changes; do not reset, revert, or overwrite them. This plan does not assume those edits are disposable or all belong to this feature.
9. **No project-level test script or existing project test suite was found.** The package has `dev`, `build`, and `build:electron` scripts; the only discovered test files are under `node_modules`. Use type checks and focused local smoke tests; do not run the slow electron-builder build as validation.

---

## 3. Chosen design

### 3.1 Answer modes and request behavior

Add a typed output mode:

```ts
type AnswerOutputMode = 'both' | 'simple' | 'contextual'
```

- Default: `both` for existing users/settings that do not yet have this property.
- The mode selector is associated with the answer panel and saved as a user preference. It applies to **newly detected questions**. A question already streaming keeps its original mode, so changing a control cannot silently cancel or mutate an in-flight request.
- Each answer card remains independently collapsible in `Both` mode. Collapsing is display-only; it does not discard its stream or stored content.
- In `Simple` mode, do not issue the Contextual request. In `Contextual` mode, do not issue the Simple request. In `Both` mode, issue one of each concurrently.
- If a new question arrives while the user has a section collapsed, do not automatically change the selected mode or force-scroll to that section; keep the answer view stable and let the user reveal it.

#### Simple prompt

- Include the current question and concise spoken-answer instructions.
- Omit previous interview turns and, for the agreed meaning of **“without context”**, omit resume text/personalization too. This makes it a genuinely standalone/reference answer.
- Use an already-integrated fast tier/model path. Do not introduce a new model ID or change model strategy as part of this feature.

#### Contextual prompt

- Include the latest question clearly marked as the **current question** and explicitly say it is the primary task.
- Provide up to the last **four complete prior conversation messages**: at most two completed contextual Q&A pairs, flattened in user/assistant order. Do not include a half-finished assistant answer as context.
- Instruct the model in the same request: prior messages are background only; use them only when the current question refers to or depends on them. For a standalone current question, answer it independently and do not force prior details into it.
- Preserve the existing candidate-resume behavior here (resume is relevant personalization for the context-aware answer).
- Do not make a preliminary classifier call. The single Contextual answer call performs relevance/classification and answer generation together.

> **Interpretation fixed for this plan:** “last 4 messages” means four prior role messages (two Q&A pairs), **not** four prior questions. The current question is added separately as the latest user message. If the user means four full Q&A pairs instead, confirm before implementation because that changes context size and token use.

#### History construction and concurrency

Replace the mutable flat message array as the source of truth with completed contextual Q&A pairs (or an equivalent immutable, ordered representation). At question arrival:

1. Capture a history snapshot from the last two **completed** contextual Q&A pairs.
2. Start requested generation streams from that immutable snapshot.
3. Never put Simple answers into contextual history; only a completed Contextual answer is eligible for the next question's history.
4. Add an answer pair only after the Contextual stream completes successfully. Failed/partial responses must not be represented as completed assistant turns.
5. Keep question identity/order separate from completion order. If an earlier question is still streaming when the next question arrives, only completed pairs enter the snapshot; do not block the live answer waiting for it.

This avoids array interleaving, includes no incomplete assistant response, and adds no classification round-trip. It does **not** solve candidate speech being re-detected; that remains deferred Feature 3.

#### Per-result state and IDs

Represent the two outcomes separately on each question, for example:

- `simpleAnswer`, `simpleStatus`, `simpleError`
- `contextualAnswer`, `contextualStatus`, `contextualError`
- status values: `not_requested | pending | streaming | completed | failed | interrupted`
- retain question ID, source, number, timestamps, and selected generation mode.

Do not overload one `answer` string for two independent streams. For old persisted records, normalize the legacy `answer` into a clearly labeled **Legacy answer** (rather than claiming whether it was Simple or Contextual); keep the original text visible.

#### Token/rate-limit trade-off

`Both` makes two model requests per question and therefore uses additional tokens/rate-limit budget. It is still only one call per answer type, with no extra classifier call. `Simple` or `Contextual` mode issues only one call. No model ID is being added. Report that both-stream mode costs more and its total completion time depends on the existing Groq endpoint/network; do not promise a fixed latency.

### 3.2 Durable app-run sessions and History UI

#### Persistence structure

Keep `StorageManager` and the existing disguised local data directory. Replace the day-bucket as the write target for **new** data with one JSON file per app run, e.g.:

```text
answers/
  run_<started-at>_<unique-id>.json
```

Each record includes:

- `schemaVersion`
- unique `sessionId`
- `startedAt`, optional `endedAt`, and a derived/display date
- ordered question records with source, detected/created time, selected output mode, both answer payloads, and independent status/error metadata

At startup, create exactly one new run record. Save a question record before starting its model requests; update the corresponding answer fields as results finish. Keep writes scoped to the owning session and question ID so parallel streams cannot overwrite one another. Use safe/atomic JSON writes (temporary sibling + rename) so a process exit during a write is less likely to corrupt the entire file. Avoid disk writes on every streamed token; persist the initial question and each answer's terminal result. If the process exits mid-stream, mark leftover `pending`/`streaming` results `interrupted` on the next load/start.

#### Backward compatibility

- Continue reading existing `answers/session_YYYY-MM-DD.json` files as **legacy daily sessions**.
- Do not rename, delete, or rewrite old files in place. The original records do not contain enough information to recover individual app starts, so label them as legacy/day-grouped, not separate runs.
- Normalize old records at read time. Preserve question text and answer text; represent old single `answer` as `Legacy answer`.
- New writes go only to the new per-run format. No destructive migration is needed.

#### Run boundaries

- A fresh app launch starts a new persisted run.
- The current **Refresh** action continues to clear the live question panel and in-memory contextual history without deleting stored Q&A or creating a new app-run file. New questions after Refresh remain in the same app-launch run; this preserves the user-defined “one app start = one session” grouping. If Refresh is intended to mean a separate interview/run, revisit this boundary before implementation.
- On a normal app quit, persist `endedAt`. If there is no `endedAt` at the next launch, label the prior run as unclean/interrupted rather than silently treating it as a completed run.

#### History UI boundary

- Add a **History** entry/view within the existing window, not a separate app/window or a database-backed subsystem.
- Keep the existing live Questions + Answer panels as the Live view. History is a separate screen/state with a run list and a selected-run detail view.
- List runs newest-first with start date/time, completion/unfinished status, and question count. Selecting a run shows its questions; selecting a question reveals its saved Legacy/Simple/Contextual result and status.
- History is read-only in the first implementation: no model calls, regenerate actions, delete actions, exports, or transcript playback. This prevents accidental cost/data loss and keeps the requested “see my interview questions and answers” flow focused.
- Load a run's question details only when selected; do not hydrate every past answer into the active live store at app startup.
- Keep local data local. The existing folder name is obfuscated, not encryption; make no claim that plain JSON is secure against another local user.

#### Why not a separate database/project?

The current use case is local personal history with small JSON records and no queries/analytics requirements. A History screen plus distinct per-run storage methods/types keeps Live and History UI state separate without introducing SQLite, dependencies, schema migrations, or a second app. If volume/search grows materially, a database can be reconsidered later. A **separate view and a clean storage boundary** are appropriate; a separate database/app is not currently justified.

### 3.3 Sticky reading / scroll

- Keep a ref to the single actual scroll viewport.
- On a selected question ID change, set that viewport to the top once (prefer layout-timed repositioning so the new content is visible at the top).
- Do not mutate `scrollTop` in response to answer chunks, markdown reflow, or streaming completion.
- Make `.answer-content` the sole vertical scroller; make `.answer-display` content-height-driven (no nested `overflow-y: auto`). Keep code blocks horizontally scrollable.
- If the Simple and Contextual sections are both present, they share the same vertical viewport in a deterministic order: Simple first, Contextual second. Manual scrolling reveals the rest. The selected question's scroll starts at its Simple/top section.
- Respect manual scroll if a new chunk changes layout. Do not add an auto-follow/bottom button unless user requests it after trying the simple behavior.

### 3.4 Feature 3 stays untouched

The source-blind detector still examines both Candidate/mic and Interviewer/speaker final transcript text. This can cause candidate readback to be interpreted as another question. It is a known, deferred issue—not fixed by this plan. Do not silently fold in interviewer-only detection or mic suppression. When Feature 3 is revisited, decide source policy and false-negative trade-off explicitly with the user.

---

## 4. Files likely affected

| Area | Likely files | Purpose |
|---|---|---|
| Main process generation | `electron/llmEngine.ts` | Split prompt/request paths; snapshot four prior messages; independent stream outputs; correct contextual-history commit. |
| Main process question orchestration | `electron/main.ts` | Start one question record, launch requested streams concurrently, route typed chunks/status per question+answer type, save completion/failure, close run. |
| Persistent local data | `electron/storageManager.ts` | Per-run files, question updates, list/load history, read-only legacy normalization, safe writes, interruption marking. |
| IPC contract | `electron/ipcHandlers.ts`, `electron/preload.ts`, `src/vite-env.d.ts` | Mode updates / history list and selected-run loading; typed event payload for `simple` vs `contextual`; update/replace existing question on regenerate. |
| Shared types | `src/types/question.ts`, `src/types/settings.ts` (and appropriate main-process types) | Output mode, independent answer states, session/run DTOs, backward-compatible normalization. |
| Live state/settings | `src/store/index.ts`, `src/App.tsx`, `src/components/Toolbar/Toolbar.tsx` | Selected mode, dual chunk updates, history view state, load saved setting. Keep live state distinct from loaded history. |
| Answer UI | `src/components/AnswerPanel/AnswerPanel.tsx`, `AnswerDisplay.tsx`, `AnswerPanel.css` | Mode selector, two independent answer sections/collapse controls, independent error/loading states, one top-sticky/manual scroll container. |
| History UI | New focused `src/components/History/...` components and styles | Run list, selected run, question/answer detail. Read-only. |
| Settings persistence | `electron/storageManager.ts`, settings types, relevant toolbar/UI | Persist default output mode with a backward-compatible `both` default. |
| Documentation | `docs/README.md`, `docs/RESUME.md`, new `docs/SESSION_HISTORY.md`; both project and global AI Interview Helper skills if architecture/navigation rules change | Keep the repo's standing documentation handoff current. Update only what is relevant and keep both skill copies in sync. |

Do **not** edit `electron/modelStrategy.ts` or add a model. Do not overwrite unrelated user modifications in any listed file; reconcile against the latest local diff first.

---

## 5. Implementation sequence

### Phase 0 — Pre-implementation safety/baseline

1. Re-read the current git diff for every planned file because the worktree is already dirty.
2. Confirm no changes have been made by the user since this plan was written; preserve all existing edits.
3. Capture the current app's actual UI at its current route/window when it can be run safely; note Electron's actual launch command/port from package scripts. Do not make Groq requests as a UI test while its endpoint is currently blocked.
4. Confirm the one remaining semantic assumption if needed: Simple answer excludes resume/personalization; Contextual keeps it.

### Phase 1 — Types and local session repository

1. Define per-answer status/result types and a versioned app-run document.
2. Add run-start/run-end, create-question, update-answer-result, list-runs, and load-run methods to `StorageManager`.
3. Preserve legacy daily JSON records via read-time normalization; new data only uses per-run files.
4. Make filesystem location injectable or isolate the serializer/repository boundary enough for tests to use a temp directory without touching the user's real answer history.
5. Verify old records remain byte-for-byte untouched during read/list flows; verify atomic write failure does not replace an existing good file.

### Phase 2 — Dual request pipeline and stable four-message context

1. Replace the single always-context request path with the selected output mode.
2. Capture an immutable snapshot of up to four prior completed contextual messages for each question.
3. Start Simple and Contextual streams concurrently only in `both` mode; emit typed chunks to separate fields.
4. Give each generation independent pending/streaming/completed/failed states and errors.
5. Add only a completed Contextual answer to future context; never include Simple or failed/partial answers.
6. Save the question before requests and persist each final result independently.
7. Correct regeneration so a request targets the same question record/answer slot instead of inserting another question row.
8. Keep candidate mic/question detection behavior unchanged (Feature 3 deferred).

### Phase 3 — Live UI and sticky reading

1. Add `Both / Simple / Contextual` mode control; default to Both and persist it for the next detected question. Lock mode for a question once generation starts.
2. Render two clearly labeled answer sections with separate loading, stream, error, and completed states. A failure in one must leave the other usable.
3. Add per-section collapse/display controls without clearing the answer.
4. Change renderer state update to route chunks by question ID and answer type.
5. Consolidate to one vertical viewport. Move to the top only when selected question changes, never on chunks.
6. Test switching selected questions during parallel generation; chunks must update the correct question and not unexpectedly switch selection/scroll.

### Phase 4 — Session History experience

1. Create a History view within the existing app window, separate from the live panel state.
2. Show new app runs newest-first and load one selected run's questions/details on demand.
3. Normalize legacy day files and show a clear “Legacy answer” label; never infer per-launch runs that the old data cannot prove.
4. Ensure selecting history does not trigger `processNewQuestion`, mutate live current-question state, add to LLM context, or call Groq.
5. Check empty state (no history), legacy-only history, one completed run, interrupted run, and two runs from the same date.

### Phase 5 — Documentation and verification

1. Update `docs/README.md`, `docs/RESUME.md`, add `docs/SESSION_HISTORY.md`; update project and global skill copies if this lasting architecture change warrants it.
2. Run `npx tsc -p tsconfig.electron.json --noEmit` and `npx tsc --noEmit`.
3. Emit compiled main-process JS with `npx tsc -p tsconfig.electron.json` after main/electron source edits (required by the launcher).
4. Do **not** run `npm run build:electron` as validation.
5. Run focused persistence smoke tests in a temporary directory: two app runs on one date remain distinct, one question with both outcomes is retained, mode-only skips the other result, legacy daily files load unchanged, refresh clears context but not saved run data, and interrupted streams are marked.
6. Test dual stream behavior with a local stub/test seam rather than depending on the blocked Groq endpoint; verify fast/simple chunks appear before a deliberately delayed contextual stream and a failure in either stream leaves the other intact.
7. Start the real local app if the environment permits. Verify the History/live switch, both answer sections, selector, empty/error/loading states, manual scroll stability during streamed text, keyboard access, and runtime console errors at desktop overlay dimensions. Record actual route/viewport and any unavailable live Groq check honestly.
8. Review final diff to ensure only intended feature changes and documentation were added; report any pre-existing dirty files separately.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Two simultaneous completions interleave history | Immutable per-question snapshot; contextual Q&A-pair store; only completed pairs appended. |
| `Both` doubles token/rate-limit use | Make one-answer modes skip the unneeded request; show selected mode clearly; no extra classifier call. |
| A standalone question still gets contaminated | Separate Simple prompt has no conversation history; Contextual prompt explicitly makes current question primary and history conditional background. |
| Resume still influences “simple” | Plan treats Simple as no resume/personal history. Confirm this assumption if Ayush intended to keep resume-based first-person personalization in Simple. |
| Old answer JSON is misunderstood | Read-time schema normalization; label as Legacy answer; never rewrite old files; do not infer launch times. |
| History crashes or corrupts JSON | Per-run files, atomic replacement, persist question before generation, load-time interrupted status. |
| Regenerate duplicates Q rows | Target existing question ID and selected answer slot; preserve original question identity. |
| UI scroll keeps fighting user | One scroller; top reset only on selected question change; no chunk-triggered scroll. |
| Pre-existing worktree changes are overwritten | Inspect diffs first and patch only scoped blocks; no reset/revert/clean operations. |
| Candidate speech creates extra questions | Explicitly deferred Feature 3; do not claim this feature fixes it. |
| Live Groq validation remains blocked | No model additions/strategy edits; use local stub for UI/pipeline tests and report live endpoint limitation. |

---

## 7. Decisions captured and items to confirm before coding

### Captured from the user

- Same-call contextual relevance classification; no separate classifier call.
- Context has the last four messages.
- Feature 3 (candidate mic/readback detection) is deferred for a later discussion.
- Persistent history should group questions and answers by app-start session and be easy to browse.
- Discussion/plan first; no implementation yet.

### Plan assumptions to confirm

1. “Last four messages” = four prior user/assistant messages (two completed Q&A pairs), plus the new current question.
2. Simple means no prior Q&A **and no resume/personalization**. Contextual retains resume behavior.
3. One app launch equals one stored run. Refresh clears live UI/context but does not erase stored history or create a second run.
4. Default answer mode is Both; changing the selector affects newly detected questions, not an in-flight question.
5. New History view is read-only initially; no delete/regenerate/export/transcript features.

No code will be changed until the user reviews this plan and says to proceed.

