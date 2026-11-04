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

const BASE_SYSTEM_PROMPT = `You are a real-time AI interview assistant. The candidate is in a live technical interview right now and needs an answer they can speak out loud in the next 10 seconds.

Candidate's Resume:
---
{RESUME_TEXT}
---

Rules:
1. Speak AS the candidate (first person: "I", "my", "in my experience")
2. Keep it CONCISE — 3-7 sentences for conceptual questions
3. Use natural spoken language — NOT bullet points (unless explicitly asked to list)
4. Add natural fillers: "basically", "you know", "so", "right", "essentially"
5. For coding questions: write complete, working code in a markdown code block, then explain it in 2 sentences
6. Mention relevant resume experience when applicable
7. Start answers naturally — NOT with "Certainly!" or "Great question!" or "Of course!"
8. Sound confident and knowledgeable but conversational`

/**
 * LLM Engine using Groq API (OpenAI-compatible) for answer generation with streaming.
 * Tiered models: instant / balanced / deep — see modelStrategy.ts
 */
export class LLMEngine {
  private openai: any = null
  private resume: string
  private model: string
  private answerMode: AnswerMode = 'auto'
  private conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []

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

  private buildSystemPrompt(): string {
    const resumeSection = this.resume
      ? this.resume
      : 'No resume provided. Give general answers.'
    return BASE_SYSTEM_PROMPT.replace('{RESUME_TEXT}', resumeSection)
  }

  async generateAnswerStream(
    question: string,
    opts: { source?: 'voice' | 'screenshot' | 'clipboard'; forceTier?: ModelTier } = {}
  ): Promise<any> {
    if (!this.openai) {
      // Return a mock stream when no API key
      return this.createMockStream(question)
    }

    const systemPrompt = this.buildSystemPrompt()

    // Resolve model tier — local string matching only, zero added latency
    const tier: ModelTier = opts.forceTier || resolveTier(this.answerMode, question, opts.source || 'voice')
    let modelToUse = getModelId(tier)

    // Guard: a stale/unverified model id (e.g. from an old settings.json) would 404.
    // Swap it for a verified one up-front instead of showing the user a raw error.
    if (!isVerifiedModel(modelToUse)) {
      console.warn(`[LLM] Unverified model '${modelToUse}' — falling back to ${MODEL_FALLBACKS[0]}`)
      modelToUse = MODEL_FALLBACKS[0]
      this.model = modelToUse
    }
    console.log(`[LLM] tier=${tier} model=${modelToUse} source=${opts.source || 'voice'}`)

    const requestFor = (model: string) => {
      const body: any = {
        model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.conversationHistory.slice(-6),
          { role: 'user', content: question },
        ],
        temperature: 0.7,
        max_tokens: 800,
      }
      // Reasoning models: keep hidden reasoning short so the first visible word
      // arrives fast and max_tokens is spent on the answer, not on thinking.
      if (REASONING_MODELS.test(model)) body.reasoning_effort = 'low'
      return body
    }

    let stream: any
    try {
      stream = await this.openai.chat.completions.create(requestFor(modelToUse))
    } catch (err: any) {
      if (!isUnusableModelError(err)) throw err
      // Model rejected at request time (revoked/retired between checks) — retry once
      // on the highest-quality verified model so the user still gets an answer.
      const retryModel = MODEL_FALLBACKS[0]
      if (retryModel === modelToUse) throw err
      console.warn(`[LLM] Model '${modelToUse}' rejected — retrying with ${retryModel}`)
      modelToUse = retryModel
      this.model = retryModel
      stream = await this.openai.chat.completions.create(requestFor(retryModel))
    }

    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: question })

    // We need to collect the assistant's response for history after streaming
    const self = this
    const originalStream = stream
    const wrappedStream = (async function* () {
      let fullResponse = ''
      for await (const chunk of originalStream) {
        const delta = chunk.choices[0]?.delta?.content || ''
        if (delta) fullResponse += delta
        yield chunk
      }
      self.addToHistory('assistant', fullResponse)
    })()

    return wrappedStream
  }

  private async *createMockStream(question: string) {
    const mockAnswer = `So basically, regarding "${question}", you know, this is a really interesting topic. In my experience, I'd say the key thing to understand here is the fundamental concepts behind it. Let me explain...\n\n_Note: Configure your Groq API key in Settings to get real AI-generated answers._`

    const words = mockAnswer.split(' ')
    for (const word of words) {
      yield {
        choices: [{ delta: { content: word + ' ' } }],
      }
      await new Promise(r => setTimeout(r, 30))
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

  /** Set answer mode: 'auto' (smart select) or a fixed tier */
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
    this.conversationHistory = []
  }

  addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content })
    // Keep only last 10 entries
    if (this.conversationHistory.length > 10) {
      this.conversationHistory = this.conversationHistory.slice(-10)
    }
  }
}
