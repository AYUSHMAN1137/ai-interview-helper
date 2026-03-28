export interface Settings {
  resume: string
  openaiApiKey: string
  deepgramApiKey: string
  language: string
  windowOpacity: number
  windowBounds: { x: number; y: number; width: number; height: number }
  hotkeys: Record<string, string>
}
