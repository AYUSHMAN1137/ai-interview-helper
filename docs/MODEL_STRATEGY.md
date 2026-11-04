# Groq Model Strategy — Verified Models Only

> **Status:** ✅ Fixed on 2026-10-14
> **Files:** [`electron/modelStrategy.ts`](../electron/modelStrategy.ts), [`electron/llmEngine.ts`](../electron/llmEngine.ts)

---

## ⚠️ The Rule

**NEVER add a model id to this codebase without first testing it against YOUR Groq account.**

Groq model availability is **per-account**. A model that works for someone else, or that
appears in Groq's public docs, can still return:

```
404 The model <model-id> does not exist or you do not have access to it.
```

That is exactly what happened with `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`.

---

## The 30-Second Live Check

Run this **before** touching [`modelStrategy.ts`](../electron/modelStrategy.ts).
It reads your key straight from `.env` — nothing to paste.

```powershell
# 1. Which models does THIS account actually have?
$raw = Get-Content '.env' -Raw
$key = (($raw -split "`n" | Where-Object { $_ -match '^\s*GROQ_API_KEY=' }) -replace '^\s*GROQ_API_KEY=','').Trim()
$h = @{ Authorization = "Bearer $key"; 'Content-Type' = 'application/json' }
(Invoke-RestMethod -Uri 'https://api.groq.com/openai/v1/models' -Headers $h).data.id
```

```powershell
# 2. Does it actually ANSWER? (a listed model can still be unusable)
$body = @{
  model    = 'openai/gpt-oss-20b'          # <- change this
  messages = @(@{ role = 'user'; content = 'Reply with exactly: OK' })
  max_tokens = 200                          # <- keep >= 200, see reasoning-token note
} | ConvertTo-Json -Depth 5
(Invoke-RestMethod -Uri 'https://api.groq.com/openai/v1/chat/completions' `
  -Headers $h -Method Post -Body $body -TimeoutSec 45).choices[0].message.content
```

✅ **Pass** = non-empty content returned. ❌ **Fail** = exception / empty content.

> [!IMPORTANT]
> Use `max_tokens >= 200` when testing. The `gpt-oss` models are **reasoning models** — they
> spend hidden reasoning tokens *before* the first visible word. With a tiny budget like
> `max_tokens: 10` they return an **empty string even though the request succeeds**, which
> looks like a broken model but is not.

---

## ✅ Models Verified On This Account (2026-10-14)

Full list returned by `GET /v1/models` for this account — only the first three can answer questions:

| Model ID | Usable for answers? | Tier | Notes |
|---|---|---|---|
| `openai/gpt-oss-120b` | ✅ | **deep** | Best quality — coding / system design |
| `openai/gpt-oss-20b` | ✅ | **instant** | Fastest — conceptual Q&A |
| `qwen/qwen3.8-27b` | ✅ | **balanced** | Technical Q&A. Also the **vision** model |
| `allam-2-7b` | ⚠️ | — | Only 4096 context — too small for this app |
| `openai/gpt-oss-safeguard-20b` | ❌ | — | Safety classifier, not a general model |
| `meta-llama/llama-prompt-guard-2-22m` | ❌ | — | Prompt-injection guard |
| `meta-llama/llama-prompt-guard-2-86m` | ❌ | — | Prompt-injection guard |
| `whisper-large-v3` | ❌ | — | Audio (STT) only |
| `whisper-large-v3-turbo` | ❌ | — | Audio (STT) only |
| `canopylabs/orpheus-v1-english` | ❌ | — | Text-to-speech only |
| `canopylabs/orpheus-arabic-saudi` | ❌ | — | Text-to-speech only |

### ❌ Do NOT use — confirmed 404 on this account

| Model ID | Error |
|---|---|
| `llama-3.3-70b-versatile` | `404 The model ... does not exist or you do not have access to it` |
| `llama-3.1-8b-instant` | Retired by Groq + not in this account's list |

---

## How Tier Selection Works

```
                 ┌──────────── user mode setting ────────────┐
                 │                                            │
        'auto'   │        'instant' / 'balanced' / 'deep'     │
           │     │                     │                      │
           ▼     │                     ▼                      │
   ┌───────────────┴──┐        use that tier directly         │
   │ selectTier()     │◄──────────────────────────────────────┘
   │ (local, 0 ms)    │
   └───────┬──────────┘
           │
     source == 'screenshot' ──► deep
     source == 'clipboard'  ──► balanced
     question matches a TECHNICAL_PATTERN ──► balanced
     otherwise ──► instant
```

`selectTier()` is **pure local regex matching** — it makes no network call, so smart
auto-selection adds **zero latency** to the answer pipeline.

---

## Two Safety Nets Added (2026-10-14)

### 1. Pre-flight guard
In [`llmEngine.ts`](../electron/llmEngine.ts) `generateAnswerStream()`:

```ts
if (!isVerifiedModel(modelToUse)) {
  modelToUse = MODEL_FALLBACKS[0]   // openai/gpt-oss-120b
}
```

A stale model id sitting in an old `settings.json` is silently swapped for a verified
one instead of throwing a raw 404 at the user.

### 2. Retry on rejection
If Groq rejects the model at request time (retired between checks, access revoked):

```ts
catch (err) {
  if (!isUnusableModelError(err)) throw err
  stream = await this.openai.chat.completions.create(requestFor(MODEL_FALLBACKS[0]))
}
```

`isUnusableModelError()` matches `404`, `does not exist`, `do not have access`,
`model_not_found`, `decommissioned`, `no longer supported`.

---

## Reasoning-Token Handling

`gpt-oss-120b` and `gpt-oss-20b` are reasoning models. Without tuning, they burn tokens
thinking before the first visible word arrives.

Measured on this account (same prompt, `max_tokens: 800`):

| Setting | Time to complete | Visible content |
|---|---|---|
| default reasoning | 1596 ms | 376 chars |
| `reasoning_effort: 'low'` | **1170 ms** | **590 chars** |

`reasoning_effort: 'low'` is **faster *and* produces a longer visible answer** — so
[`llmEngine.ts`](../electron/llmEngine.ts) applies it automatically:

```ts
const REASONING_MODELS = /^openai\/gpt-oss/
if (REASONING_MODELS.test(model)) body.reasoning_effort = 'low'
```

`qwen/qwen3.8-27b` accepts the same parameter, but it is not a reasoning model so it is
left alone (and `qwen` rejects unknown parameters on some endpoints).

---

## Vision Model

[`electron/screenshotCapture.ts`](../electron/screenshotCapture.ts) uses:

```ts
const VISION_MODEL = 'qwen/qwen3.8-27b'
```

Chosen because it is the only verified model on this account that advertises
`input_modalities: ["text", "image"]`. Do not swap it without re-running the live check
**and** confirming image input support.

---

## Changelog

| Date | Change |
|---|---|
| 2026-10-14 | Replaced 404-ing `llama-3.3-70b-versatile` / `llama-3.1-8b-instant` with live-verified `gpt-oss-20b` / `qwen3.8-27b` / `gpt-oss-120b`. Added `MODEL_FALLBACKS`, `isVerifiedModel()`, pre-flight guard, retry-on-rejection, and `reasoning_effort: 'low'` for gpt-oss models. |
