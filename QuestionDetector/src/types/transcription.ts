export interface TranscriptEntryType {
  id: string
  speaker: 'Candidate' | 'Interviewer'
  text: string
  timestamp: string
  isFinal: boolean
}
