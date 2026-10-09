export interface Settings {
  resume: string
  openaiApiKey: string
  deepgramApiKey: string
  model: string
  language: string
  windowOpacity: number
  windowBounds: { x: number; y: number; width: number; height: number }
  hotkeys: Record<string, string>
}
