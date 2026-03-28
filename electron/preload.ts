import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Renderer → Main
  toggleMic: (on: boolean) => ipcRenderer.invoke('toggle-mic', { on }),
  toggleSpeaker: (on: boolean) => ipcRenderer.invoke('toggle-speaker', { on }),
  triggerScreenshot: () => ipcRenderer.invoke('trigger-screenshot'),
  triggerClipboard: () => ipcRenderer.invoke('trigger-clipboard'),
  refreshSession: () => ipcRenderer.invoke('refresh-session'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  getUsage: () => ipcRenderer.invoke('get-usage'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  addClipboardQuestion: (text: string) => ipcRenderer.invoke('add-clipboard-question', { text }),

  // Mic audio chunk (renderer → main, Web Audio API)
  sendMicAudio: (buffer: ArrayBuffer) => ipcRenderer.send('mic-audio-chunk', Buffer.from(buffer)),

  // Main → Renderer listeners
  onNewQuestion: (cb: (data: any) => void) => {
    ipcRenderer.on('new-question', (_event, data) => cb(data))
  },
  onAnswerChunk: (cb: (data: any) => void) => {
    ipcRenderer.on('answer-stream-chunk', (_event, data) => cb(data))
  },
  onTranscriptEntry: (cb: (data: any) => void) => {
    ipcRenderer.on('transcript-entry', (_event, data) => cb(data))
  },
  onUsageUpdate: (cb: (data: any) => void) => {
    ipcRenderer.on('usage-update', (_event, data) => cb(data))
  },
  onScanningStatus: (cb: (data: any) => void) => {
    ipcRenderer.on('scanning-status', (_event, data) => cb(data))
  },
  onHotkeyMicToggle: (cb: (data: any) => void) => {
    ipcRenderer.on('hotkey-mic-toggle', (_event, data) => cb(data))
  },
  onHotkeySpeakerToggle: (cb: (data: any) => void) => {
    ipcRenderer.on('hotkey-speaker-toggle', (_event, data) => cb(data))
  },
  onHotkeyScreenshot: (cb: () => void) => {
    ipcRenderer.on('hotkey-screenshot', () => cb())
  },
  onHotkeyClipboard: (cb: () => void) => {
    ipcRenderer.on('hotkey-clipboard', () => cb())
  },
  onHotkeyRefresh: (cb: () => void) => {
    ipcRenderer.on('hotkey-refresh', () => cb())
  },
  onStartMicCapture: (cb: () => void) => {
    ipcRenderer.on('start-mic-capture', () => cb())
  },
  onStopMicCapture: (cb: () => void) => {
    ipcRenderer.on('stop-mic-capture', () => cb())
  },

  // Cleanup
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
