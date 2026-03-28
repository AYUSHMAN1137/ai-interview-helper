export interface Question {
  id: string
  number: number
  text: string
  answer: string
  isStreaming: boolean
  detectedFrom: 'voice' | 'screenshot' | 'clipboard'
  timestamp: string
}

export interface TranscriptEntry {
  id: string
  speaker: 'Candidate' | 'Interviewer'
  text: string
  timestamp: string
  isFinal: boolean
}
