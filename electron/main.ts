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
import { QuestionDetector } from './questionDetector'
import { AudioCaptureService } from './audioCapture'
import { registerHotkeys } from './hotkeys'
import { UsageTracker } from './usageTracker'
import { getModelId, type ModelTier } from './modelStrategy'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let sttEngine: STTEngine | null = null
let llmEngine: LLMEngine | null = null
let screenshotService: ScreenshotService | null = null
let storageManager: StorageManager | null = null
let questionDetector: QuestionDetector | null = null
let audioCaptureService: AudioCaptureService | null = null
let usageTracker: UsageTracker | null = null

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

  llmEngine = new LLMEngine(openaiKey, settings.resume || '', model)
  if (settings.answerMode) {
    llmEngine.updateAnswerMode(settings.answerMode)
  }
  screenshotService = new ScreenshotService(openaiKey, model)
  questionDetector = new QuestionDetector()
  usageTracker = new UsageTracker(storageManager)
  sttEngine = new STTEngine(deepgramKey)
  audioCaptureService = new AudioCaptureService()

  // STT connections are now ON-DEMAND (connectSource called when mic/speaker enabled)
  // Do NOT call sttEngine.connect() here — it would timeout before user enables mic

  // Wire up STT events
  sttEngine.on('transcript', (data: any) => {
    if (!mainWindow) return
    mainWindow.webContents.send('transcript-entry', data)

    // Detect questions from BOTH Interviewer and Candidate speech
    // Interviewer questions are the primary use case, but Candidate speech
    // can also contain questions (e.g., user testing, or reading a question aloud)
    if (data.isFinal) {
      const isQ = questionDetector!.isQuestion(data.text)
      if (isQ) {
        processNewQuestion(data.text, 'voice')
      }
    }
  })
}

async function processNewQuestion(
  text: string,
  source: 'voice' | 'screenshot' | 'clipboard',
  opts: { forceTier?: ModelTier } = {}
) {
  if (!mainWindow || !llmEngine || !storageManager) return

  const questionId = `q_${Date.now()}`
  const questionNumber = (global as any).__questionCounter = ((global as any).__questionCounter || 0) + 1

  const question = {
    id: questionId,
    number: questionNumber,
    text: text,
    answer: '',
    isStreaming: true,
    detectedFrom: source,
    timestamp: new Date().toISOString(),
  }

  mainWindow.webContents.send('new-question', { question })

  try {
    const stream = await llmEngine.generateAnswerStream(text, { source, forceTier: opts.forceTier })
    let fullAnswer = ''

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || ''
      if (delta) {
        fullAnswer += delta
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('answer-stream-chunk', {
            questionId,
            chunk: delta,
            isDone: false,
          })
        }
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('answer-stream-chunk', {
        questionId,
        chunk: '',
        isDone: true,
      })
    }

    // Save to storage
    storageManager.saveAnswer({
      ...question,
      answer: fullAnswer,
      isStreaming: false,
    })
  } catch (err: any) {
    console.error('LLM error:', err)
    mainWindow.webContents.send('answer-stream-chunk', {
      questionId,
      chunk: `\n\n_Error generating answer: ${err.message}_`,
      isDone: true,
    })
  }
}

// ── Catch-all: no Electron window may ever appear in the taskbar ──────────────
// 'browser-window-created' fires for EVERY BrowserWindow the app creates, including
// the DevTools window and any popup a library opens. Electron's `skipTaskbar` only sets
// WS_EX_TOOLWINDOW but never clears WS_EX_APPWINDOW (which Windows prioritises), so we
// re-assert the native tool-window style on every window as it is created and once its
// native handle is ready.
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
  loadEnvFile()
  await initializeServices()

  mainWindow = createMainWindow()

  // CRITICAL ORDERING: the window is created hidden (show: false). Apply the native
  // tool-window styles and only THEN reveal it. If the window is visible first, Windows
  // registers a taskbar button before we can touch the styles, and SWP_FRAMECHANGED
  // cannot reliably remove a button that already exists.
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

  // Apply invisibility AFTER window content loads (SetWindowDisplayAffinity needs a visible window)
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return

        // Safety net: 'ready-to-show' can fail to fire on some transparent-window / GPU
        // configurations. Without this the window would stay hidden forever and the app
        // would look completely broken. Styles still go on BEFORE the reveal.
        if (!mainWindow.isVisible()) {
          console.warn('[taskbar] ready-to-show did not fire — revealing via fallback')
          hideFromTaskbar(mainWindow, 'main(fallback-reveal)')
          mainWindow.show()
        }

        hideFromScreenCapture(mainWindow)
        // HWND is fully realised by now — re-assert tool-window style as a safety net
        hideFromTaskbar(mainWindow, 'main(post-load)')
      }, 500) // Small delay to ensure window is fully rendered
    }
  })

  // DevTools opens as its OWN native top-level window and is NOT covered by the main
  // window's skipTaskbar flag — that stray window is what shows the Electron icon in the
  // taskbar. Intercept it and hard-hide it the moment it opens.
  mainWindow.webContents.on('devtools-opened', () => {
    const devToolsWC = mainWindow?.webContents?.devToolsWebContents
    if (!devToolsWC) return
    const devToolsWindow = BrowserWindow.fromWebContents(devToolsWC)
    if (!devToolsWindow) return
    devToolsWindow.setSkipTaskbar(true)
    hideFromTaskbar(devToolsWindow, 'devtools')
    console.log('✓ [taskbar] DevTools window hidden from taskbar')
  })

  // Open devtools in development — undocked so it does not overlay the answer panel
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
    processNewQuestion
  )

  // Register global hotkeys
  registerHotkeys(mainWindow, audioCaptureService!, sttEngine!, storageManager!)

  // Wire usage tracker to window for IPC updates
  usageTracker!.setMainWindow(mainWindow)

  // Start usage tracking
  usageTracker!.startSession()

  // Create launcher in disguised data dir for easy access
  storageManager!.createLauncher(
    app.isPackaged ? process.execPath : path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe'),
    app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..')
  )

  // Set up system tray
  setupTray()

  mainWindow.on('close', (e) => {
    // 'close' is from Exit button (win.close()) — allow it.
    // But intercept OS close button clicks to hide instead? No — Exit means quit.
    mainWindow = null
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  usageTracker?.stopSession()
  sttEngine?.close()
  audioCaptureService?.stopAll()
  tray?.destroy()
  app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Make processNewQuestion available globally for IPC handlers
;(global as any).processNewQuestion = function(text: string, source: 'voice' | 'screenshot' | 'clipboard', opts: { forceTier?: ModelTier } = {}) {
  return processNewQuestion(text, source, opts)
}
