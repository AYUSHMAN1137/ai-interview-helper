export type AnswerOutputMode = 'both' | 'simple' | 'contextual'
export type AnswerKind = 'simple' | 'contextual' | 'legacy'
export type AnswerStatus = 'not_requested' | 'pending' | 'streaming' | 'completed' | 'failed' | 'interrupted'

export interface Question {
  id: string
  number: number
  text: string
  detectedFrom: 'voice' | 'screenshot' | 'clipboard'
  timestamp: string

  // Dual answers
  outputMode?: AnswerOutputMode
  simpleAnswer?: string
  simpleStatus?: AnswerStatus
  simpleError?: string

  contextualAnswer?: string
  contextualStatus?: AnswerStatus
  contextualError?: string

  // Legacy field support
  answer?: string
  isStreaming?: boolean
}

export interface TranscriptEntry {
  id: string
  speaker: 'Candidate' | 'Interviewer'
  text: string
  timestamp: string
  isFinal: boolean
}

export interface SessionRunSummary {
  sessionId: string
  startedAt: string
  endedAt?: string
  date: string
  questionCount: number
  transcriptCount?: number
  isLegacy?: boolean
}

export interface SessionRun {
  sessionId: string
  startedAt: string
  endedAt?: string
  date: string
  isLegacy?: boolean
  stats?: {
    totalQuestions: number
    totalTranscripts: number
  }
  questions: Question[]
}
