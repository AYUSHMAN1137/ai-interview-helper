/**
 * Model Strategy — tiered model selection for live interview answers.
 *
 * ⚠️  EVERY model id below was LIVE-VERIFIED against THIS account's Groq key on 2026-10-14
 *     (GET /openai/v1/models  +  a real chat completion that returned content).
 *
 * This Groq account has access to ONLY these answer-capable chat models:
 *     openai/gpt-oss-120b · openai/gpt-oss-20b · qwen/qwen3.8-27b
 *
 * ❌ DO NOT add `llama-3.1-8b-instant` or `llama-3.3-70b-versatile`.
 *    Both 404 with "model does not exist or you do not have access to it" on this account.
 *    Always re-run the live check in the docs before adding any new model id.
 *
 * Tiers:
 *  - instant : openai/gpt-oss-20b   (fastest — conceptual Q&A)
 *  - balanced: qwen/qwen3.8-27b     (technical Q&A)
 *  - deep    : openai/gpt-oss-120b  (coding / system design, best quality)
 *
 * Tier selection is 100% local string matching (no API call),
 * so smart auto-select adds ZERO latency to the answer pipeline.
 */

export type ModelTier = 'instant' | 'balanced' | 'deep'
export type AnswerMode = 'auto' | ModelTier

/** Model IDs per tier — all live-verified against this Groq account on 2026-10-14. */
export const MODELS: Record<ModelTier, string> = {
  instant: 'openai/gpt-oss-20b',
  balanced: 'qwen/qwen3.8-27b',
  deep: 'openai/gpt-oss-120b',
}

/**
 * Last-resort retry chain, in priority order.
 * Used by LLMEngine when Groq rejects the requested model (404 model_not_found /
 * 400 decommissioned / no-access). Keeps a stale model id in an old settings.json
 * from ever surfacing a raw "404 The model ... does not exist" to the user.
 */
export const MODEL_FALLBACKS: string[] = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
]

/** True if the given model id is one this account can actually call. */
export function isVerifiedModel(modelId: string): boolean {
  return MODEL_FALLBACKS.includes(modelId)
}

export const TIER_LABELS: Record<ModelTier, string> = {
  instant: 'Instant',
  balanced: 'Balanced',
  deep: 'Deep',
}

export const TIER_ICONS: Record<ModelTier, string> = {
  instant: '⚡',
  balanced: '⚖️',
  deep: '🧠',
}

/**
 * Technical signals that justify a stronger (slightly slower) model.
 * Kept intentionally broad — false positives only cost a bit of latency,
 * false negatives cost answer quality.
 */
const TECHNICAL_PATTERNS: RegExp[] = [
  /\bcode\b/i,
  /\bfunction\b/i,
  /\balgorithm/i,
  /\bcomplexity\b/i,
  /\bimplement/i,
  /\bdebug/i,
  /\bsql\b/i,
  /\bdatabase/i,
  /\bquery\b/i,
  /\bapi\b/i,
  /\bsystem\s*design/i,
  /\bscal(e|able|ing|ability)\b/i,
  /\boptimiz/i,
  /\brefactor/i,
  /\barchitecture/i,
  /\brecursion/i,
  /\bdata\s*structure/i,
  /\bwrite\s+(a|an|the|me)\b/i,
  /\bbuild\s+(a|an|the|me)\b/i,
  /\bsol(ve|ution)\b/i,
  /\bpipeline\b/i,
  /\bdeploy/i,
  /\bkubernetes\b/i,
  /\bdocker\b/i,
  /\bmicroservice/i,
  /\breact\b/i,
  /\bpython\b/i,
  /\bjava\b/i,
  /\bjavascript\b/i,
  /\btypescript\b/i,
  /\bbackend\b/i,
  /\bfrontend\b/i,
  /\bthread/i,
  /\bmemory\s+leak/i,
  /\bexception\b/i,
  /\bpromise\b/i,
  /\bconcurren/i,
]

export function getModelId(tier: ModelTier): string {
  return MODELS[tier] || MODELS.instant
}

/**
 * Local heuristic — pick a tier from question text + detection source.
 * Runs in microseconds, no network call.
 */
export function selectTier(
  question: string,
  source: 'voice' | 'screenshot' | 'clipboard'
): ModelTier {
  // Screenshots are almost always coding problems — quality matters more than speed
  if (source === 'screenshot') return 'deep'
  // Clipboard is an explicit user action — they want the best answer
  if (source === 'clipboard') return 'balanced'

  if (question && TECHNICAL_PATTERNS.some((p) => p.test(question))) return 'balanced'

  return 'instant'
}

/**
 * Resolve the final tier honoring the user's mode setting.
 * 'auto' → smart selection; fixed tier → always that model.
 */
export function resolveTier(
  mode: AnswerMode | undefined,
  question: string,
  source: 'voice' | 'screenshot' | 'clipboard'
): ModelTier {
  if (mode && mode !== 'auto') return mode
  return selectTier(question, source)
}

/** Map a legacy raw model id (from old settings) back to a tier, if possible. */
export function tierFromModelId(modelId: string): ModelTier | null {
  if (!modelId) return null
  const entry = (Object.keys(MODELS) as ModelTier[]).find((t) => MODELS[t] === modelId)
  return entry || null
}
