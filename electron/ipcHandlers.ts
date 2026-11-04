import { ipcMain, clipboard, BrowserWindow, app, dialog } from 'electron'
import * as path from 'path'
import * as os from 'os'
import { AudioCaptureService } from './audioCapture'
import { STTEngine } from './sttEngine'
import { LLMEngine } from './llmEngine'
import { ScreenshotService } from './screenshotCapture'
import { StorageManager } from './storageManager'
import { UsageTracker } from './usageTracker'
import { QuestionDetector } from './questionDetector'
import type { ModelTier } from './modelStrategy'
import type { AnswerOutputMode } from './answerTypes'

let currentMicOn = false

export function isMicActive(): boolean {
  return currentMicOn
}

export async function toggleMicAction(
  win: BrowserWindow,
  sttEngine: STTEngine,
  desiredState?: boolean
): Promise<boolean> {
  const next = desiredState !== undefined ? desiredState : !currentMicOn
  try {
    if (next) {
      const connected = await sttEngine.connectSource('mic')
      if (!connected) {
        console.warn('Deepgram mic connection failed — mic audio will not be transcribed')
      }
      currentMicOn = true
      if (win && !win.isDestroyed()) {
        win.webContents.send('start-mic-capture')
      }
    } else {
      currentMicOn = false
      if (win && !win.isDestroyed()) {
        win.webContents.send('stop-mic-capture')
      }
      sttEngine.disconnectSource('mic')
    }
    if (win && !win.isDestroyed()) {
      win.webContents.send('hotkey-mic-toggle', { on: currentMicOn })
    }
    return currentMicOn
  } catch (err: any) {
    console.error('Mic toggle error:', err)
    if (win && !win.isDestroyed()) {
      win.webContents.send('hotkey-mic-toggle', { on: currentMicOn })
    }
    return currentMicOn
  }
}

export function registerIpcHandlers(
  win: BrowserWindow,
  audioCapture: AudioCaptureService,
  sttEngine: STTEngine,
  llmEngine: LLMEngine,
  screenshotService: ScreenshotService,
  usageTracker: UsageTracker,
  storage: StorageManager,
  questionDetector: QuestionDetector,
  processNewQuestion: (
    text: string,
    source: 'voice' | 'screenshot' | 'clipboard',
    opts?: { forceTier?: ModelTier; targetKind?: 'simple' | 'contextual'; existingQuestionId?: string }
  ) => Promise<void>,
  setOutputMode?: (mode: AnswerOutputMode) => void,
  getOutputMode?: () => AnswerOutputMode
) {
  ipcMain.handle('toggle-mic', async (_event, { on }) => {
    try {
      const resultOn = await toggleMicAction(win, sttEngine, on)
      return { success: true, on: resultOn }
    } catch (err: any) {
      console.error('Mic toggle error:', err)
      return { success: false, error: err.message, on: currentMicOn }
    }
  })

  // Receive mic audio chunks from renderer (Web Audio API - no SoX needed)
  ipcMain.on('mic-audio-chunk', (_event, data: any) => {
    if (currentMicOn) {
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
      // 1. Capture + resize the screen (overlay auto-excluded via WDA)
      const { buffer } = await screenshotService.captureScreen()

      // 2. Vision-first extraction (fast path) with OCR/text fallbacks
      const question = await screenshotService.extractQuestionWithFallbacks(buffer)
      console.log('Extracted question:', question)

      if (!question) {
        win.webContents.send('scanning-status', { status: 'done', message: 'No question found' })
        return { success: false, message: 'No question found in screenshot' }
      }

      await processNewQuestion(question, 'screenshot')
      win.webContents.send('scanning-status', { status: 'done' })
      return { success: true, question }
    } catch (err: any) {
      console.error('Screenshot error:', err)
      win.webContents.send('scanning-status', { status: 'error', message: err.message })
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('trigger-send-last-transcript', async () => {
    try {
      if ((global as any).sendLastTranscriptAsQuestion) {
        await (global as any).sendLastTranscriptAsQuestion()
        return { success: true }
      }
      return { success: false, message: 'sendLastTranscriptAsQuestion not ready' }
    } catch (err: any) {
      console.error('Send last transcript error:', err)
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
    if ((global as any).__questionDeduper) (global as any).__questionDeduper.clear()
    if ((global as any).__logBuffer) (global as any).__logBuffer.clear()
    return { success: true }
  })

  // Re-run a question without creating duplicate entries
  ipcMain.handle('regenerate-question', async (_event, { questionId, text, tier, target }) => {
    try {
      const validTier: ModelTier | undefined =
        tier === 'instant' || tier === 'balanced' || tier === 'deep' ? tier : undefined
      await processNewQuestion(text, 'voice', {
        forceTier: validTier,
        targetKind: target || 'contextual',
        existingQuestionId: questionId,
      })
      return { success: true }
    } catch (err: any) {
      console.error('Regenerate error:', err)
      return { success: false, error: err.message }
    }
  })

  // Output mode toggle (both / simple / contextual)
  ipcMain.handle('set-answer-output-mode', async (_event, { mode }) => {
    if (setOutputMode) setOutputMode(mode)
    await storage.saveSettings({ answerOutputMode: mode })
    return { success: true, mode }
  })

  // List past session runs for History viewer
  ipcMain.handle('list-session-runs', async () => {
    return await storage.listSessionRuns()
  })

  // Load questions for a selected session
  ipcMain.handle('load-session-run', async (_event, { sessionId }) => {
    return await storage.loadSessionRun(sessionId)
  })

  // Export session as Markdown or JSON
  ipcMain.handle('export-session', async (_event, { sessionId, format = 'markdown' }) => {
    try {
      const ext = format === 'json' ? 'json' : 'md'
      const defaultFilename = `interview_session_${sessionId}.${ext}`
      const defaultPath = path.join(os.homedir(), 'Desktop', defaultFilename)

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: `Export Interview Session (${format.toUpperCase()})`,
        defaultPath,
        filters: format === 'json'
          ? [{ name: 'JSON Files (*.json)', extensions: ['json'] }]
          : [{ name: 'Markdown Files (*.md)', extensions: ['md'] }, { name: 'All Files (*.*)', extensions: ['*'] }],
      })

      if (canceled || !filePath) {
        return { success: false, canceled: true }
      }

      return await storage.exportSession(sessionId, format, filePath)
    } catch (err: any) {
      console.error('Export session error:', err)
      return { success: false, error: err.message }
    }
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
    if (settings.model) {
      llmEngine.updateModel(settings.model)
      screenshotService.updateModel(settings.model)
    }
    if (settings.answerMode) {
      llmEngine.updateAnswerMode(settings.answerMode)
    }
    if (settings.answerOutputMode && setOutputMode) {
      setOutputMode(settings.answerOutputMode)
    }
    if (typeof settings.windowOpacity === 'number') {
      const val = Math.min(1.0, Math.max(0.20, settings.windowOpacity))
      win.setOpacity(val)
      win.webContents.send('opacity-change', { opacity: val })
    }
    return { success: true }
  })

  ipcMain.handle('set-opacity', async (_event, { opacity }) => {
    const val = Math.min(1.0, Math.max(0.20, Number(opacity)))
    win.setOpacity(val)
    await storage.saveSettings({ windowOpacity: val })
    win.webContents.send('opacity-change', { opacity: val })
    return { success: true, opacity: val }
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
