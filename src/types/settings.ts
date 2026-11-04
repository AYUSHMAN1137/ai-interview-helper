export interface Settings {
  resume: string
  openaiApiKey: string
  deepgramApiKey: string
  model: string
  answerMode?: 'auto' | 'instant' | 'balanced' | 'deep'
  language: string
  windowOpacity: number
  windowBounds: { x: number; y: number; width: number; height: number }
  hotkeys: Record<string, string>
}
