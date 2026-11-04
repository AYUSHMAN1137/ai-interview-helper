import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, nativeImage } from 'electron'
import * as path from 'path'

// Prevent app from showing in Windows taskbar
app.setAppUserModelId('com.ai-interview-helper.hidden')
import { createMainWindow, hideFromScreenCapture, hideFromTaskbar } from './windowManager'
import { registerIpcHandlers } from './ipcHandlers'
import { STTEngine } from './sttEngine'
import { LLMEngine } from './llmEngine'
import { ScreenshotService } from './screenshotCapture'
import { StorageManager } from './storageManager'
import { QuestionDetector, TranscriptLogBuffer, QuestionDeduper } from './questionDetector'
import { AudioCaptureService } from './audioCapture'
import { registerHotkeys } from './hotkeys'
import { UsageTracker } from './usageTracker'
import { getModelId, resolveTier, type ModelTier } from './modelStrategy'
import type { QuestionRecord, AnswerOutputMode } from './answerTypes'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let sttEngine: STTEngine | null = null
let llmEngine: LLMEngine | null = null
let screenshotService: ScreenshotService | null = null
let storageManager: StorageManager | null = null
let questionDetector: QuestionDetector | null = null
let logBuffer: TranscriptLogBuffer | null = null
let questionDeduper: QuestionDeduper | null = null
let audioCaptureService: AudioCaptureService | null = null
let usageTracker: UsageTracker | null = null
let currentOutputMode: AnswerOutputMode = 'both'

function loadEnvFile() {
  try {
    const fs = require('fs')
    const envPath = path.join(app.isPackaged ? path.dirname(process.execPath) : __dirname, '..', '.env')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8')
      content.split('\n').forEach((line: string) => {
        const [key, ...vals] = line.split('=')
        if (key && vals.length) {
          process.env[key.trim()] = vals.join('=').trim()
        }
      })
    }
  } catch (e) {
    console.warn('Could not load .env file:', e)
  }
}

async function createTrayIcon(): Promise<Electron.NativeImage> {
  try {
    // Prefer the real app icon; fall back to a sharp-generated square if missing
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png')
    const fs = require('fs')
    if (fs.existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath)
    }
    const sharp = require('sharp')
    const generatedPath = path.join(app.getPath('userData'), 'tray-icon.png')
    if (!fs.existsSync(generatedPath)) {
      await sharp({
        create: { width: 16, height: 16, channels: 4, background: { r: 34, g: 197, b: 94, alpha: 1 } },
      }).png().toFile(generatedPath)
    }
    return nativeImage.createFromPath(generatedPath)
  } catch {
    return nativeImage.createEmpty()
  }
}

function setupTray() {
  createTrayIcon().then(icon => {
    tray = new Tray(icon)
    tray.setToolTip('AI Interview Helper')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Window', click: () => {
          mainWindow?.show()
          mainWindow?.focus()
          mainWindow?.setAlwaysOnTop(true, 'screen-saver', 1)
        }
      },
      { label: 'Hide Window', click: () => mainWindow?.hide() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
    tray.setContextMenu(contextMenu)

    tray.on('click', () => {
      if (!mainWindow) return
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      }
    })
  }).catch(err => console.warn('Tray setup failed:', err))
}

async function initializeServices() {
  storageManager = new StorageManager()
  await storageManager.initialize()

  const settings = await storageManager.loadSettings()

  // Use settings API keys if available, fallback to env
  const openaiKey = settings.openaiApiKey || process.env.GROQ_API_KEY || ''
  const deepgramKey = settings.deepgramApiKey || process.env.DEEPGRAM_API_KEY || ''

  const model = settings.model || getModelId('instant')

  if (settings.answerOutputMode) {
    currentOutputMode = settings.answerOutputMode
  }

  // Start new persistent session run for this launch
  await storageManager.startSessionRun()

  llmEngine = new LLMEngine(openaiKey, settings.resume || '', model)
  if (settings.answerMode) {
    llmEngine.updateAnswerMode(settings.answerMode)
  }
  screenshotService = new ScreenshotService(openaiKey, model)
  questionDetector = new QuestionDetector()
  logBuffer = new TranscriptLogBuffer(25)
  questionDeduper = new QuestionDeduper()
  ;(global as any).__questionDeduper = questionDeduper
  ;(global as any).__logBuffer = logBuffer
  usageTracker = new UsageTracker(storageManager)
  sttEngine = new STTEngine(deepgramKey)
  audioCaptureService = new AudioCaptureService()

  // STT connections are now ON-DEMAND (connectSource called when mic/speaker enabled)
  // Wire up STT events
  sttEngine.on('transcript', (data: any) => {
    if (!mainWindow) return
    mainWindow.webContents.send('transcript-entry', data)

    // Keep rolling log of last 25 transcript items
    logBuffer?.add({
      id: data.id || `t_${Date.now()}`,
      speaker: data.speaker || 'Interviewer',
      text: data.text || '',
      timestamp: Date.now(),
      isFinal: !!data.isFinal,
    })

    if (data.isFinal) {
      // Record final transcript to persistent session timeline
      const cleanTranscript = data.text ? data.text.trim() : ''
      if (cleanTranscript) {
        storageManager?.recordTranscript({
          speaker: data.speaker || 'Interviewer',
          text: cleanTranscript,
          isFinal: true,
          timestamp: data.timestamp || new Date().toISOString(),
        }).catch(err => console.error('[Storage] Error recording transcript:', err))
      }

      // Direct question detection from speech chunk as usual
      const cleanText = data.text ? data.text.trim() : ''
      if (cleanText && questionDetector?.isQuestion(cleanText)) {
        const dedupe = questionDeduper?.check(cleanText)
        if (dedupe?.isDuplicate) {
          if (dedupe.isSuperset && dedupe.targetQuestionId) {
            console.log(`[Dedupe] Growing partial superset detected for ${dedupe.targetQuestionId}: "${cleanText}"`)
            questionDeduper?.updateQuestion(dedupe.targetQuestionId, cleanText)
            processNewQuestion(cleanText, 'voice', { existingQuestionId: dedupe.targetQuestionId })
          } else {
            console.log(`[Dedupe] Suppressed duplicate question: "${cleanText}"`)
          }
          return
        }

        const qId = `q_${Date.now()}`
        questionDeduper?.recordQuestion(qId, cleanText)
        processNewQuestion(cleanText, 'voice', { existingQuestionId: qId })
      }
    }
  })
}

/**
 * Force-sends the latest transcribed speech entry as a question (triggered by Alt+Enter).
 */
async function sendLastTranscriptAsQuestion() {
  const recent = logBuffer ? logBuffer.getRecentLogs(25) : []
  if (recent.length === 0) {
    console.log('[Alt+Enter] No transcription logs available')
    return
  }
  const interviewerLogs = recent.filter(l => l.speaker === 'Interviewer' && l.text.trim().length > 0)
  const target = interviewerLogs.length > 0 ? interviewerLogs[interviewerLogs.length - 1] : recent[recent.length - 1]
  const text = target.text.trim()
  if (!text) return
  console.log(`[Alt+Enter] Force-sending latest transcript as question: "${text}"`)
  const qId = `q_${Date.now()}`
  questionDeduper?.recordQuestion(qId, text)
  await processNewQuestion(text, 'voice', { existingQuestionId: qId })
}

;(global as any).sendLastTranscriptAsQuestion = sendLastTranscriptAsQuestion

async function processNewQuestion(
  text: string,
  source: 'voice' | 'screenshot' | 'clipboard',
  opts: { forceTier?: ModelTier; targetKind?: 'simple' | 'contextual'; existingQuestionId?: string } = {}
) {
  if (!mainWindow || !llmEngine || !storageManager) return

  const questionId = opts.existingQuestionId || `q_${Date.now()}`
  const existingRecord = (global as any).__questionMap?.[questionId]
  const questionNumber = existingRecord?.number
    ? existingRecord.number
    : (((global as any).__questionCounter = ((global as any).__questionCounter || 0) + 1))

  const modeToUse: AnswerOutputMode = opts.targetKind === 'simple'
    ? 'simple'
    : (opts.targetKind === 'contextual' ? 'contextual' : currentOutputMode)

  const recentLogs = logBuffer ? logBuffer.getRecentLogs(25) : []
  const formattedLogs = recentLogs
    .map(l => `[${l.speaker}]: ${l.text}`)
    .join('\n')

  const resolvedContextualTier: ModelTier = opts.forceTier || resolveTier(llmEngine.getAnswerMode(), text, source)
  const contextualModel = getModelId(resolvedContextualTier)
  const contextualFullPrompt = formattedLogs.trim().length > 0
    ? `Recent Live Interview Audio Transcription Logs (Background Context):\n---\n${formattedLogs.trim()}\n---\n\nQuestion / Prompt to Answer: "${text}"\n\nInstruction: Using the recent transcription logs to understand what was being discussed (especially if the prompt is short or a follow-up like "Tell me more"), formulate and deliver the candidate's spoken answer with key points highlighted in bold (**key point**).`
    : text

  const question: QuestionRecord = {
    id: questionId,
    number: questionNumber,
    text: text,
    detectedFrom: source,
    timestamp: new Date().toISOString(),
    outputMode: modeToUse,
    simpleAnswer: '',
    simpleStatus: modeToUse === 'contextual' ? 'not_requested' : 'streaming',
    contextualAnswer: '',
    contextualStatus: modeToUse === 'simple' ? 'not_requested' : 'streaming',
    answer: '',
    isStreaming: true,
    simplePipeline: modeToUse === 'contextual' ? undefined : {
      model: 'openai/gpt-oss-20b',
      prompt: text,
      answer: '',
      status: 'streaming',
      startedAt: new Date().toISOString(),
    },
    contextualPipeline: modeToUse === 'simple' ? undefined : {
      model: contextualModel,
      tier: resolvedContextualTier,
      injectedBackgroundLogs: recentLogs.map(l => `[${l.speaker}]: ${l.text}`),
      fullPrompt: contextualFullPrompt,
      answer: '',
      status: 'streaming',
      startedAt: new Date().toISOString(),
    },
  }

  if (!(global as any).__questionMap) {
    (global as any).__questionMap = {}
  }
  (global as any).__questionMap[questionId] = question

  mainWindow.webContents.send('new-question', { question })
  await storageManager.saveInitialQuestion(question)

  // 1. Simple stream (direct, fast, zero context)
  const runSimple = async () => {
    if (modeToUse === 'contextual') return
    const simpleStart = Date.now()
    try {
      mainWindow?.webContents.send('answer-stream-chunk', {
        questionId,
        kind: 'simple',
        chunk: '',
        isDone: false,
      })

      const stream = await llmEngine!.generateSimpleAnswerStream(text)
      let fullSimple = ''

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || ''
        if (delta) {
          fullSimple += delta
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('answer-stream-chunk', {
              questionId,
              kind: 'simple',
              chunk: delta,
              isDone: false,
            })
          }
        }
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('answer-stream-chunk', {
          questionId,
          kind: 'simple',
          chunk: '',
          isDone: true,
        })
      }

      const latencyMs = Date.now() - simpleStart
      await storageManager!.updateQuestionAnswer(questionId, {
        simpleAnswer: fullSimple,
        simpleStatus: 'completed',
        simplePipeline: {
          model: 'openai/gpt-oss-20b',
          prompt: text,
          answer: fullSimple,
          status: 'completed',
          startedAt: new Date(simpleStart).toISOString(),
          completedAt: new Date().toISOString(),
          latencyMs,
        },
        ...(modeToUse === 'simple' ? { answer: fullSimple } : {})
      })
    } catch (err: any) {
      console.error('Simple stream error:', err)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('answer-stream-chunk', {
          questionId,
          kind: 'simple',
          chunk: `\n\n_Error: ${err.message}_`,
          isDone: true,
          error: err.message,
        })
      }
      const latencyMs = Date.now() - simpleStart
      await storageManager!.updateQuestionAnswer(questionId, {
        simpleStatus: 'failed',
        simpleError: err.message,
        simplePipeline: {
          model: 'openai/gpt-oss-20b',
          prompt: text,
          answer: '',
          status: 'failed',
          startedAt: new Date(simpleStart).toISOString(),
          completedAt: new Date().toISOString(),
          latencyMs,
          error: err.message,
        }
      })
    }
  }

  // 2. Contextual stream (with in-flight relevance evaluation)
  const runContextual = async () => {
    if (modeToUse === 'simple') return
    const contextualStart = Date.now()
    try {
      mainWindow?.webContents.send('answer-stream-chunk', {
        questionId,
        kind: 'contextual',
        chunk: '',
        isDone: false,
      })

      const stream = await llmEngine!.generateContextualAnswerStream(text, {
        source,
        forceTier: opts.forceTier,
        recentTranscriptLogs: formattedLogs,
      })
      let fullContextual = ''

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || ''
        if (delta) {
          fullContextual += delta
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('answer-stream-chunk', {
              questionId,
              kind: 'contextual',
              chunk: delta,
              isDone: false,
            })
          }
        }
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('answer-stream-chunk', {
          questionId,
          kind: 'contextual',
          chunk: '',
          isDone: true,
        })
      }

      const latencyMs = Date.now() - contextualStart
      await storageManager!.updateQuestionAnswer(questionId, {
        contextualAnswer: fullContextual,
        contextualStatus: 'completed',
        answer: fullContextual,
        contextualPipeline: {
          model: contextualModel,
          tier: resolvedContextualTier,
          injectedBackgroundLogs: recentLogs.map(l => `[${l.speaker}]: ${l.text}`),
          fullPrompt: contextualFullPrompt,
          answer: fullContextual,
          status: 'completed',
          startedAt: new Date(contextualStart).toISOString(),
          completedAt: new Date().toISOString(),
          latencyMs,
        }
      })
    } catch (err: any) {
      console.error('Contextual stream error:', err)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('answer-stream-chunk', {
          questionId,
          kind: 'contextual',
          chunk: `\n\n_Error: ${err.message}_`,
          isDone: true,
          error: err.message,
        })
      }
      const latencyMs = Date.now() - contextualStart
      await storageManager!.updateQuestionAnswer(questionId, {
        contextualStatus: 'failed',
        contextualError: err.message,
        contextualPipeline: {
          model: contextualModel,
          tier: resolvedContextualTier,
          injectedBackgroundLogs: recentLogs.map(l => `[${l.speaker}]: ${l.text}`),
          fullPrompt: contextualFullPrompt,
          answer: '',
          status: 'failed',
          startedAt: new Date(contextualStart).toISOString(),
          completedAt: new Date().toISOString(),
          latencyMs,
          error: err.message,
        }
      })
    }
  }

  // Run requested streams in parallel
  await Promise.allSettled([runSimple(), runContextual()])
}

// ── Catch-all: no Electron window may ever appear in the taskbar ──────────────
app.on('browser-window-created', (_event, win) => {
  try {
    win.setSkipTaskbar(true)
    hideFromTaskbar(win, 'auto')
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) {
        win.setSkipTaskbar(true)
        hideFromTaskbar(win, 'auto(ready)')
      }
    })
  } catch (e: any) {
    console.warn('[taskbar] catch-all failed:', e?.message || e)
  }
})

app.whenReady().then(async () => {
  // Disable default Chromium menu to prevent Alt key hijacking on Windows
  Menu.setApplicationMenu(null)
  loadEnvFile()
  await initializeServices()

  mainWindow = createMainWindow()

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    hideFromTaskbar(mainWindow, 'main(ready-to-show)')
    mainWindow.show()
    console.log('✓ [taskbar] window revealed AFTER tool-window styles were applied')
  })

  // Apply initial saved opacity
  if (storageManager) {
    const settings = await storageManager.loadSettings()
    const initialOpacity = typeof settings.windowOpacity === 'number' ? settings.windowOpacity : 0.88
    mainWindow.setOpacity(initialOpacity)
  }

  // Load the renderer
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Apply invisibility AFTER window content loads
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return

        if (!mainWindow.isVisible()) {
          console.warn('[taskbar] ready-to-show did not fire — revealing via fallback')
          hideFromTaskbar(mainWindow, 'main(fallback-reveal)')
          mainWindow.show()
        }

        hideFromScreenCapture(mainWindow)
        hideFromTaskbar(mainWindow, 'main(post-load)')
      }, 500)
    }
  })

  // DevTools window handling
  mainWindow.webContents.on('devtools-opened', () => {
    const devToolsWC = mainWindow?.webContents?.devToolsWebContents
    if (!devToolsWC) return
    const devToolsWindow = BrowserWindow.fromWebContents(devToolsWC)
    if (!devToolsWindow) return
    devToolsWindow.setSkipTaskbar(true)
    hideFromTaskbar(devToolsWindow, 'devtools')
    console.log('✓ [taskbar] DevTools window hidden from taskbar')
  })

  // Open devtools in development — undocked
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'undocked' })
  }

  // Register IPC handlers
  registerIpcHandlers(
    mainWindow,
    audioCaptureService!,
    sttEngine!,
    llmEngine!,
    screenshotService!,
    usageTracker!,
    storageManager!,
    questionDetector!,
    processNewQuestion,
    (mode) => { currentOutputMode = mode },
    () => currentOutputMode
  )

  // Register global hotkeys
  registerHotkeys(mainWindow, audioCaptureService!, sttEngine!, storageManager!)

  // Wire usage tracker to window for IPC updates
  usageTracker!.setMainWindow(mainWindow)
  usageTracker!.startSession()

  // Create launcher in disguised data dir for easy access
  storageManager!.createLauncher(
    app.isPackaged ? process.execPath : path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe'),
    app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..')
  )

  // Set up system tray
  setupTray()

  mainWindow.on('close', () => {
    mainWindow = null
  })
})

app.on('window-all-closed', () => {
  storageManager?.endSessionRun().catch(() => {})
  globalShortcut.unregisterAll()
  usageTracker?.stopSession()
  sttEngine?.close()
  audioCaptureService?.stopAll()
  tray?.destroy()
  app.quit()
})

app.on('will-quit', () => {
  storageManager?.endSessionRun().catch(() => {})
  globalShortcut.unregisterAll()
})

// Make processNewQuestion available globally for IPC handlers
;(global as any).processNewQuestion = function(
  text: string,
  source: 'voice' | 'screenshot' | 'clipboard',
  opts: { forceTier?: ModelTier; targetKind?: 'simple' | 'contextual'; existingQuestionId?: string } = {}
) {
  return processNewQuestion(text, source, opts)
}
