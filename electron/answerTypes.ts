export type AnswerOutputMode = 'both' | 'simple' | 'contextual'
export type AnswerKind = 'simple' | 'contextual' | 'legacy'
export type AnswerStatus = 'not_requested' | 'pending' | 'streaming' | 'completed' | 'failed' | 'interrupted'

export interface SimplePipelineAudit {
  model: string
  prompt: string
  answer: string
  status: AnswerStatus
  startedAt: string
  completedAt?: string
  latencyMs?: number
  error?: string
}

export interface ContextualPipelineAudit {
  model: string
  tier?: string
  injectedBackgroundLogs?: string[]
  fullPrompt: string
  answer: string
  status: AnswerStatus
  startedAt: string
  completedAt?: string
  latencyMs?: number
  error?: string
}

export interface QuestionRecord {
  id: string
  number: number
  text: string
  detectedFrom: 'voice' | 'screenshot' | 'clipboard' | 'manual_alt_enter'
  timestamp: string
  outputMode: AnswerOutputMode

  // Simple answer
  simpleAnswer?: string
  simpleStatus?: AnswerStatus
  simpleError?: string

  // Contextual answer
  contextualAnswer?: string
  contextualStatus?: AnswerStatus
  contextualError?: string

  // Complete Pipeline Audits
  simplePipeline?: SimplePipelineAudit
  contextualPipeline?: ContextualPipelineAudit

  // Legacy field support
  answer?: string
  isStreaming?: boolean
}

export interface SessionTimelineEvent {
  id: string
  type: 'transcription' | 'question_turn'
  timestamp: string

  // For transcription events:
  speaker?: 'Candidate' | 'Interviewer'
  text?: string
  isFinal?: boolean

  // For question_turn events:
  questionId?: string
  questionNumber?: number
  detectedFrom?: 'voice' | 'screenshot' | 'clipboard' | 'manual_alt_enter'
  questionText?: string
  simplePipeline?: SimplePipelineAudit
  contextualPipeline?: ContextualPipelineAudit
}

export interface SessionRun {
  sessionId: string
  startedAt: string
  endedAt?: string
  date: string
  isLegacy?: boolean
  stats: {
    totalQuestions: number
    totalTranscripts: number
  }
  timeline: SessionTimelineEvent[]
  questions: QuestionRecord[]
}

export interface SessionRunSummary {
  sessionId: string
  startedAt: string
  endedAt?: string
  date: string
  questionCount: number
  transcriptCount: number
  isLegacy?: boolean
}
