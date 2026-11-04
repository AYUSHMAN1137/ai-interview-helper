# Dual Answers, Sticky Reading & Session History

> **Status:** ✅ Implemented & verified (2026-11-04)
> **Files:**
> - [`electron/answerTypes.ts`](../electron/answerTypes.ts)
> - [`electron/llmEngine.ts`](../electron/llmEngine.ts)
> - [`electron/main.ts`](../electron/main.ts)
> - [`electron/questionDetector.ts`](../electron/questionDetector.ts)
> - [`electron/storageManager.ts`](../electron/storageManager.ts)
> - [`electron/ipcHandlers.ts`](../electron/ipcHandlers.ts)
> - [`electron/hotkeys.ts`](../electron/hotkeys.ts)
> - [`src/store/index.ts`](../src/store/index.ts)
> - [`src/components/QuestionsPanel/QuestionsPanel.css`](../src/components/QuestionsPanel/QuestionsPanel.css)
> - [`src/components/AnswerPanel/AnswerDisplay.tsx`](../src/components/AnswerPanel/AnswerDisplay.tsx)
> - [`src/components/AnswerPanel/AnswerPanel.css`](../src/components/AnswerPanel/AnswerPanel.css)
> - [`src/components/TranscriptionLogs/TranscriptionLogs.tsx`](../src/components/TranscriptionLogs/TranscriptionLogs.tsx)
> - [`src/components/TranscriptionLogs/TranscriptionLogs.css`](../src/components/TranscriptionLogs/TranscriptionLogs.css)
> - [`src/components/History/HistoryView.tsx`](../src/components/History/HistoryView.tsx)
> - [`src/components/Toolbar/Toolbar.tsx`](../src/components/Toolbar/Toolbar.tsx)
> - [`tools/test-dual-history.js`](../tools/test-dual-history.js)

---

## 1. Dual Answer Strategy (Simple + Contextual)

### Output Modes
- **`both` (Default):** Streams both answers in parallel into **side-by-side 50/50 columns** (`.answer-split-grid`). Simple arrives first (ultra-fast, ~400-800ms first token) in the left column; Contextual streams concurrently in the right column.
- **`simple`:** Only generates and displays the Simple answer.
- **`contextual`:** Only generates and displays the Contextual answer.

#### Section A — Simple Answer (Left Column)
- **Prompt:** Direct, concise spoken response (2-5 sentences).
- **Clean Input:** Receives the clean, detected question (as usual) — zero logs, zero history. Fast, unbiased, standalone.
- **Model:** `openai/gpt-oss-20b` (fastest verified model) with `reasoning_effort: 'low'`.

#### Section B — Contextual Answer (Right Column)
- **Prompt & Background Context:** Comprehensive spoken response incorporating resume experience. Receives the last 20–25 transcription logs in the background within the API call, so it understands what was being discussed even if the interviewer just said *"Tell me more"* or *"How does that compare?"*.
- **UI Cleanliness:** The UI displays only the concise question title (no 25-log wall in the question card).
- **Key Talking Point Highlights:** Selectively bolds (`**key point**`) 2-4 critical anchor terms/metrics per paragraph.
- **Visual Highlight Badge:** In CSS, `.answer-section-card--contextual .md-bold` is styled with a soft luminous amber-gold tint (`#fef08a`) and subtle background badge (`rgba(234, 179, 8, 0.16)`).
- **Model:** Tier-selected (`qwen/qwen3.8-27b` / `openai/gpt-oss-120b`).
- **History commit:** Only completed Contextual answers are committed to conversation history (capped at 8 messages / 4 complete turns).

---

## 2. Speech Detection, Rolling Buffering & Force-Send (`Alt+Enter`)

### As-Usual Question Detection
- Evaluates incoming `isFinal` speech chunks as usual using `isQuestion(cleanText)`.
- Added natural follow-up question starters: `'tell me more'`, `'tell me about'`, `'elaborate'`, `'can you elaborate'`, `'explain more'`, `'go on'`, `'continue'`.
- Reduced min word threshold to 2 words so short prompts like *"Tell me more"* or *"Why that?"* are detected naturally.

### Rolling Log Buffer & Deduplication
- **Rolling Log Buffer (`TranscriptLogBuffer`):** Buffers the last 25 transcript entries in memory for background context.
- **Growing Superset Upgrade (`QuestionDeduper`):** If a chunk triggered an early partial question, and the next chunk completes it within 8s, it updates the existing question's text in place and re-runs the answer instead of spawning a duplicate question.
- **Exact & Overlap Deduplication:** Suppresses exact matches within 30 seconds and >70% Jaccard word overlaps.

### Force-Send Latest Transcript (`Alt+Enter`)
- When the interviewer says something short that was transcribed into Transcription Logs without triggering auto-detection, the user can press **`Alt+Enter`** (or click the **Ask Last** button in the Transcription Logs header).
- Instantly sends the latest transcribed speech to trigger answers.
- Simple Answer gives the direct reply; Contextual Answer uses the last 25 logs to understand full context and deliver a complete answer.

---

## 3. Layout, Sticky Reading & Accessible Shortcuts

| Action | New Shortcut | Legacy Shortcut | Note |
|---|---|---|---|
| **Ask Last Transcript** | `Alt+Enter` | — | Force-sends latest transcription log as question |
| **Screenshot** | `Alt+S` | `Ctrl+Shift+P` | Screen capture & vision OCR |
| **Clipboard** | `Alt+C` | `Ctrl+Shift+C` | Instant question extraction from copied text |
| **Hide / Show Overlay** | `Alt+H` | `Ctrl+Shift+H` | Instant stealth toggle |
| **Refresh Session** | `Alt+R` | `Ctrl+Shift+R` | Clear live turns and reset |
| **Mic Toggle** | `Alt+M` | `Ctrl+Shift+M` | Candidate mic on/off (unified state + in-window listener) |
| **Speaker Toggle** | — | `Ctrl+Shift+S` | Interviewer audio capture on/off |
| **Opacity Control** | `Ctrl+↑` / `Ctrl+↓` | — | Step opacity by 5% |

- **Width Tuning:** Questions panel 18% (`140px` to `200px`), Answers panel ~82% width.
- **Sticky Reading:** Pinned to top upon question selection (`scrollTop = 0`), zero jumping during streaming.

---

## 4. Single-File Session Audit Trail & Direct Export

### Single-File Audit Format (`session_<timestamp>_<id>.json`)
Every interview run is recorded into **ONE well-organized session JSON file** in `answers/`:
```json
{
  "sessionId": "session_1793790180618_iljm2",
  "startedAt": "2026-11-04T11:03:00.618Z",
  "endedAt": "2026-11-04T11:45:12.000Z",
  "date": "2026-11-04",
  "stats": {
    "totalQuestions": 4,
    "totalTranscripts": 38
  },
  "timeline": [
    {
      "id": "t_1793790181000_abc",
      "type": "transcription",
      "timestamp": "2026-11-04T11:03:01.000Z",
      "speaker": "Interviewer",
      "text": "Hello, welcome to the interview.",
      "isFinal": true
    },
    {
      "id": "turn_q_1793790190000",
      "type": "question_turn",
      "timestamp": "2026-11-04T11:03:10.000Z",
      "questionId": "q_1793790190000",
      "questionNumber": 1,
      "detectedFrom": "voice",
      "questionText": "Can you explain the difference between useMemo and useCallback in React?",
      "simplePipeline": {
        "model": "openai/gpt-oss-20b",
        "prompt": "Can you explain the difference between useMemo and useCallback in React?",
        "answer": "...",
        "status": "completed",
        "startedAt": "2026-11-04T11:03:10.100Z",
        "completedAt": "2026-11-04T11:03:11.080Z",
        "latencyMs": 980
      },
      "contextualPipeline": {
        "model": "openai/gpt-oss-120b",
        "tier": "tier2_advanced",
        "injectedBackgroundLogs": [
          "[Interviewer]: Hello, welcome to the interview."
        ],
        "fullPrompt": "Recent Live Interview Audio Transcription Logs:\n[Interviewer]: Hello...\nQuestion: Can you explain...",
        "answer": "...",
        "status": "completed",
        "startedAt": "2026-11-04T11:03:10.120Z",
        "completedAt": "2026-11-04T11:03:12.970Z",
        "latencyMs": 2850
      }
    },
    {
      "id": "t_1793790200000_def",
      "type": "transcription",
      "timestamp": "2026-11-04T11:03:20.000Z",
      "speaker": "Interviewer",
      "text": "That makes total sense. Let us dive into state management next.",
      "isFinal": true
    }
  ],
  "questions": [ ... ]
}
```

### Direct Session Export (History UI)
In the History viewer header, users can click **📥 Export Session (.md)** or **JSON**:
- **Markdown (.md):** Creates an interview report with:
  1. Header metadata (date, times, statistics).
  2. Summary table of questions, detected sources, latencies, and statuses.
  3. Detailed question turn cards with both Simple & Contextual answers, models, latencies, and collapsable background logs.
  4. Chronological audit table of all spoken dialogue and questions.
- **Save Dialog:** Native Windows save dialog defaulting to Desktop with prefilled name `interview_session_<sessionId>.md`.

---

## 5. Verification
Smoke test scripts:
```powershell
node tools/test-dual-history.js
node tools/test-session-audit.js
```
All test suites pass.
