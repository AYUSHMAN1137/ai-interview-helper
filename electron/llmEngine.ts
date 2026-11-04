import { getModelId, resolveTier, isVerifiedModel, MODEL_FALLBACKS, type ModelTier, type AnswerMode } from './modelStrategy'

/** gpt-oss models are reasoning models — they burn hidden tokens before the first visible word. */
const REASONING_MODELS = /^openai\/gpt-oss/

/** A model error that means "this model id is unusable" — retry with a verified one. */
function isUnusableModelError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase()
  const status = err?.status || err?.response?.status
  if (status === 404) return true
  return (
    msg.includes('does not exist') ||
    msg.includes('do not have access') ||
    msg.includes('model_not_found') ||
    msg.includes('decommissioned') ||
    msg.includes('no longer supported')
  )
}

/** Standalone, fast, direct prompt without any conversation history or resume personalization */
const SIMPLE_SYSTEM_PROMPT = `You are a real-time AI interview assistant. The candidate is in a live technical interview right now and needs a fast, direct, concise answer they can speak out loud in the next 10 seconds.

Rules:
1. Answer the question directly without any assumptions about past questions or background.
2. Keep it CONCISE — 2-5 sentences for conceptual questions.
3. Speak AS the candidate (first person: "I", "my", "in my experience").
4. Use natural spoken conversational language — NOT bullet points (unless explicitly asked to list).
5. For coding questions: write complete working code in a markdown code block, then explain in 1-2 sentences.
6. Start answers naturally — NOT with "Certainly!" or "Great question!" or "Of course!".
7. Sound confident, knowledgeable, and natural.`

/** Context-aware prompt that evaluates background relevance in-flight */
const CONTEXTUAL_BASE_SYSTEM_PROMPT = `You are a real-time AI interview assistant helping a candidate in a live technical interview. The candidate needs an answer they can speak out loud in the next 10 seconds.

Candidate's Resume:
---
{RESUME_TEXT}
---

CRITICAL INSTRUCTIONS FOR CONTEXT & RELEVANCE:
- You may be provided with the last few messages of the conversation as background context.
- The CURRENT user question is your primary focus.
- CLASSIFY IN-FLIGHT: First evaluate whether the current question is a follow-up or depends on recent conversation context (e.g. questions using pronouns like "it", "that", "this", "how does that compare", "can you optimize that", "why did you choose that approach", or continuing a previous topic).
  * If it IS a follow-up or context-dependent: Seamlessly incorporate the necessary background from previous messages into your answer.
  * If it is a STANDALONE or new question (e.g. topic switch): Answer it completely independently! Do NOT force-fit prior conversation details into it.

Rules:
1. Speak AS the candidate (first person: "I", "my", "in my experience").
2. Keep it focused and conversational — 3-7 sentences for conceptual questions.
3. Use natural spoken language — NOT bullet points (unless explicitly asked to list).
4. Add natural spoken fillers when appropriate ("basically", "you know", "right", "essentially").
5. For coding questions: write complete working code in a markdown code block, then explain it in 2 sentences.
6. Mention relevant resume experience when applicable.
7. Start answers naturally — NOT with "Certainly!" or "Great question!" or "Of course!".
8. Sound confident, knowledgeable, and conversational.
9. KEY POINT HIGHLIGHTING: Bold (**like this**) the 2-4 most critical key phrases, metrics, or core technical decisions in your response. This allows the candidate's eyes to instantly scan and spot the core points at a glance while speaking in the interview. Do NOT over-highlight — never bold whole sentences, only the punchy anchor terms.`

/**
 * LLMEngine using Groq API for dual answer streaming:
 * - Simple answer: zero context, ultra-fast static answer
 * - Contextual answer: evaluates last 4 messages in-flight with tier selection
 */
export class LLMEngine {
  private openai: any = null
  private resume: string
  private model: string
  private answerMode: AnswerMode = 'auto'
  private contextualHistory: { role: 'user' | 'assistant'; content: string }[] = []

  constructor(apiKey: string, resume: string, model: string = getModelId('instant')) {
    this.resume = resume
    this.model = model || getModelId('instant')
    this.initClient(apiKey)
  }

  private initClient(apiKey: string) {
    if (!apiKey || apiKey === 'your_groq_api_key_here') {
      console.warn('Groq API key not configured — LLM disabled')
      return
    }
    try {
      const OpenAI = require('openai')
      this.openai = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      })
    } catch (err) {
      console.error('Failed to initialize Groq client:', err)
    }
  }

  private buildContextualSystemPrompt(): string {
    const resumeSection = this.resume
      ? this.resume
      : 'No resume provided. Give general answers.'
    return CONTEXTUAL_BASE_SYSTEM_PROMPT.replace('{RESUME_TEXT}', resumeSection)
  }

  /**
   * Generates a Simple answer stream (direct, zero context, fast).
   */
  async generateSimpleAnswerStream(question: string): Promise<any> {
    if (!this.openai) {
      return this.createMockStream(question, 'simple')
    }

    const modelToUse = getModelId('instant') // openai/gpt-oss-20b
    const body: any = {
      model: modelToUse,
      stream: true,
      messages: [
        { role: 'system', content: SIMPLE_SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
      temperature: 0.6,
      max_tokens: 600,
    }
    if (REASONING_MODELS.test(modelToUse)) {
      body.reasoning_effort = 'low'
    }

    try {
      return await this.openai.chat.completions.create(body)
    } catch (err: any) {
      if (isUnusableModelError(err)) {
        const fallback = MODEL_FALLBACKS[0]
        body.model = fallback
        if (REASONING_MODELS.test(fallback)) body.reasoning_effort = 'low'
        return await this.openai.chat.completions.create(body)
      }
      throw err
    }
  }

  /**
   * Generates a Contextual answer stream (with up to last 4 messages as background context).
   */
  async generateContextualAnswerStream(
    question: string,
    opts: {
      source?: 'voice' | 'screenshot' | 'clipboard'
      forceTier?: ModelTier
      recentTranscriptLogs?: string
    } = {}
  ): Promise<any> {
    let stream: any

    if (!this.openai) {
      stream = this.createMockStream(question, 'contextual')
    } else {
      const systemPrompt = this.buildContextualSystemPrompt()
      const tier: ModelTier = opts.forceTier || resolveTier(this.answerMode, question, opts.source || 'voice')
      let modelToUse = getModelId(tier)

      if (!isVerifiedModel(modelToUse)) {
        console.warn(`[LLM] Unverified model '${modelToUse}' — falling back to ${MODEL_FALLBACKS[0]}`)
        modelToUse = MODEL_FALLBACKS[0]
        this.model = modelToUse
      }
      console.log(`[LLM Contextual] tier=${tier} model=${modelToUse} source=${opts.source || 'voice'}`)

      // Take an immutable snapshot of up to the last 4 messages (2 complete turns)
      const historySnapshot = this.contextualHistory.slice(-4)

      let userContent = question
      if (opts.recentTranscriptLogs && opts.recentTranscriptLogs.trim().length > 0) {
        userContent = `Recent Live Interview Audio Transcription Logs (Background Context):\n---\n${opts.recentTranscriptLogs.trim()}\n---\n\nQuestion / Prompt to Answer: "${question}"\n\nInstruction: Using the recent transcription logs to understand what was being discussed (especially if the prompt is short or a follow-up like "Tell me more"), formulate and deliver the candidate's spoken answer with key points highlighted in bold (**key point**).`
      }

      const requestFor = (model: string) => {
        const body: any = {
          model,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            ...historySnapshot,
            { role: 'user', content: userContent },
          ],
          temperature: 0.7,
          max_tokens: 800,
        }
        if (REASONING_MODELS.test(model)) body.reasoning_effort = 'low'
        return body
      }

      try {
        stream = await this.openai.chat.completions.create(requestFor(modelToUse))
      } catch (err: any) {
        if (!isUnusableModelError(err)) throw err
        const retryModel = MODEL_FALLBACKS[0]
        if (retryModel === modelToUse) throw err
        console.warn(`[LLM] Model '${modelToUse}' rejected — retrying with ${retryModel}`)
        modelToUse = retryModel
        this.model = retryModel
        stream = await this.openai.chat.completions.create(requestFor(retryModel))
      }
    }

    // Wrap stream to commit completed contextual turn to history
    const self = this
    const originalStream = stream
    const wrappedStream = (async function* () {
      let fullResponse = ''
      for await (const chunk of originalStream) {
        const delta = chunk.choices[0]?.delta?.content || ''
        if (delta) fullResponse += delta
        yield chunk
      }
      self.addContextualTurn(question, fullResponse)
    })()

    return wrappedStream
  }

  /**
   * Backward-compatible alias for existing callers.
   */
  async generateAnswerStream(
    question: string,
    opts: { source?: 'voice' | 'screenshot' | 'clipboard'; forceTier?: ModelTier } = {}
  ): Promise<any> {
    return this.generateContextualAnswerStream(question, opts)
  }

  private addContextualTurn(question: string, answer: string): void {
    if (!answer || answer.trim().length === 0) return
    this.contextualHistory.push({ role: 'user', content: question })
    this.contextualHistory.push({ role: 'assistant', content: answer.trim() })

    // Cap history at 8 messages (4 complete turns)
    if (this.contextualHistory.length > 8) {
      this.contextualHistory = this.contextualHistory.slice(-8)
    }
  }

  private async *createMockStream(question: string, type: 'simple' | 'contextual' = 'contextual') {
    const prefix = type === 'simple' ? '[Simple Direct Answer]' : '[Contextual Answer]'
    const mockAnswer = `${prefix} Regarding "${question}": Basically, the core concept here is straightforward. In my experience, you start with the fundamental architecture and ensure the components are decoupled and efficient. That gives you both scalability and reliability.`

    const words = mockAnswer.split(' ')
    for (const word of words) {
      yield {
        choices: [{ delta: { content: word + ' ' } }],
      }
      await new Promise(r => setTimeout(r, 25))
    }
  }

  updateResume(resume: string): void {
    this.resume = resume
  }

  updateModel(model: string): void {
    if (model) {
      this.model = model
    }
  }

  updateAnswerMode(mode: AnswerMode): void {
    this.answerMode = mode || 'auto'
    if (this.answerMode !== 'auto') {
      this.model = getModelId(this.answerMode as ModelTier)
    }
    console.log(`[LLM] answer mode = ${this.answerMode}`)
  }

  getAnswerMode(): AnswerMode {
    return this.answerMode
  }

  updateApiKey(apiKey: string): void {
    this.initClient(apiKey)
  }

  clearHistory(): void {
    this.contextualHistory = []
    console.log('[LLM] Contextual history cleared')
  }
}
