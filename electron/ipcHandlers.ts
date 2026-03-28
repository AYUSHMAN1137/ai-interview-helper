import { ipcMain, clipboard, BrowserWindow, app } from 'electron'
import { AudioCaptureService } from './audioCapture'
import { STTEngine } from './sttEngine'
import { LLMEngine } from './llmEngine'
import { ScreenshotService } from './screenshotCapture'
import { UsageTracker } from './usageTracker'
import { StorageManager } from './storageManager'
import { QuestionDetector } from './questionDetector'

export function registerIpcHandlers(
  win: BrowserWindow,
  audioCapture: AudioCaptureService,
  sttEngine: STTEngine,
  llmEngine: LLMEngine,
  screenshotService: ScreenshotService,
  usageTracker: UsageTracker,
  storage: StorageManager,
  questionDetector: QuestionDetector,
  processNewQuestion: (text: string, source: 'voice' | 'screenshot' | 'clipboard') => Promise<void>
) {
  let micOn = false

  ipcMain.handle('toggle-mic', async (_event, { on }) => {
    try {
      if (on) {
        // Connect Deepgram mic on-demand (avoids timeout from startup connection)
        const connected = await sttEngine.connectSource('mic')
        if (!connected) {
          console.warn('Deepgram mic connection failed — mic audio will not be transcribed')
        }
        micOn = true
        // Signal renderer to start Web Audio mic capture
        win.webContents.send('start-mic-capture')
      } else {
        micOn = false
        win.webContents.send('stop-mic-capture')
        sttEngine.disconnectSource('mic')
      }
      return { success: true, on: micOn }
    } catch (err: any) {
      console.error('Mic toggle error:', err)
      return { success: false, error: err.message, on: false }
    }
  })

  // Receive mic audio chunks from renderer (Web Audio API - no SoX needed)
  ipcMain.on('mic-audio-chunk', (_event, data: any) => {
    if (micOn) {
      // IPC serialization may convert Buffer to Uint8Array — convert back
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
      sttEngine.sendAudio(buf, 'mic')
    }
  })

  ipcMain.handle('toggle-speaker', async (_event, { on }) => {
    try {
      if (on) {
        // Connect Deepgram speaker on-demand
        const connected = await sttEngine.connectSource('speaker')
        if (!connected) {
          console.warn('Deepgram speaker connection failed')
        }
        await audioCapture.startLoopback()
        if (audioCapture.isSpeakerOn) {
          audioCapture.onSpeakerData((chunk: Buffer) => {
            sttEngine.sendAudio(chunk, 'speaker')
          })
        }
      } else {
        audioCapture.stopLoopback()
        sttEngine.disconnectSource('speaker')
      }
      return { success: true, on: on && audioCapture.isSpeakerOn }
    } catch (err: any) {
      console.error('Speaker toggle error:', err)
      return { success: false, error: err.message, on: false }
    }
  })

  ipcMain.handle('trigger-screenshot', async () => {
    win.webContents.send('scanning-status', { status: 'started' })
    try {
      // desktopCapturer uses WinRT/DirectX which respects WDA_EXCLUDEFROMCAPTURE.
      // The overlay is automatically invisible — no need to hide or set opacity.
      const ocrText = await screenshotService.captureAndOCR()

      if (!ocrText || ocrText.trim().length < 5) {
        win.webContents.send('scanning-status', { status: 'done', message: 'No text detected' })
        return { success: false, message: 'No text detected in screenshot' }
      }

      win.webContents.send('scanning-status', { status: 'processing' })
      const question = await screenshotService.extractQuestion(ocrText)
      console.log('Extracted question:', question)

      if (question) {
        await processNewQuestion(question, 'screenshot')
        win.webContents.send('scanning-status', { status: 'done' })
        return { success: true, question }
      } else {
        win.webContents.send('scanning-status', { status: 'done', message: 'No question found' })
        return { success: false, message: 'No question found in screenshot' }
      }
    } catch (err: any) {
      console.error('Screenshot error:', err)
      win.webContents.send('scanning-status', { status: 'error', message: err.message })
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('trigger-clipboard', async () => {
    try {
      const text = clipboard.readText().trim()
      if (text && text.length > 2) {
        await processNewQuestion(text, 'clipboard')
        return { success: true, text }
      }
      return { success: false, message: 'Clipboard is empty' }
    } catch (err: any) {
      console.error('Clipboard error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('add-clipboard-question', async (_event, { text }) => {
    if (text && text.trim().length > 2) {
      await processNewQuestion(text.trim(), 'clipboard')
      return { success: true }
    }
    return { success: false, message: 'Text too short' }
  })

  ipcMain.handle('refresh-session', async () => {
    (global as any).__questionCounter = 0
    llmEngine.clearHistory()
    return { success: true }
  })

  ipcMain.handle('save-settings', async (_event, settings) => {
    await storage.saveSettings(settings)
    if (settings.resume !== undefined) {
      llmEngine.updateResume(settings.resume)
    }
    if (settings.openaiApiKey) {
      llmEngine.updateApiKey(settings.openaiApiKey)
      screenshotService.updateApiKey(settings.openaiApiKey)
    }
    if (settings.deepgramApiKey) {
      sttEngine.updateApiKey(settings.deepgramApiKey)
    }
    return { success: true }
  })

  ipcMain.handle('load-settings', async () => {
    return await storage.loadSettings()
  })

  ipcMain.handle('get-usage', async () => {
    return usageTracker.getUsageInfo()
  })

  ipcMain.handle('minimize-window', () => {
    win.hide() // Hide to system tray instead of minimize (since skipTaskbar=true)
  })

  ipcMain.handle('close-window', () => {
    app.quit()
  })
}
