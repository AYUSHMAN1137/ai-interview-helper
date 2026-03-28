/// <reference types="vite/client" />

export {}

interface ElectronAPI {
  toggleMic: (on: boolean) => Promise<{ success: boolean; on?: boolean; error?: string }>
  toggleSpeaker: (on: boolean) => Promise<{ success: boolean; on?: boolean; error?: string }>
  triggerScreenshot: () => Promise<{ success: boolean; question?: string; error?: string }>
  triggerClipboard: () => Promise<{ success: boolean; text?: string; error?: string }>
  refreshSession: () => Promise<{ success: boolean }>
  saveSettings: (settings: any) => Promise<{ success: boolean }>
  loadSettings: () => Promise<any>
  getUsage: () => Promise<any>
  minimizeWindow: () => void
  closeWindow: () => void
  addClipboardQuestion: (text: string) => Promise<{ success: boolean }>
  
  sendMicAudio: (buffer: ArrayBuffer) => void
  onStartMicCapture: (cb: () => void) => void
  onStopMicCapture: (cb: () => void) => void
  
  onNewQuestion: (cb: (data: any) => void) => void
  onAnswerChunk: (cb: (data: any) => void) => void
  onTranscriptEntry: (cb: (data: any) => void) => void
  onUsageUpdate: (cb: (data: any) => void) => void
  onScanningStatus: (cb: (data: any) => void) => void
  onHotkeyMicToggle: (cb: (data: any) => void) => void
  onHotkeySpeakerToggle: (cb: (data: any) => void) => void
  onHotkeyScreenshot: (cb: () => void) => void
  onHotkeyClipboard: (cb: () => void) => void
  onHotkeyRefresh: (cb: () => void) => void
  
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
