import { globalShortcut, BrowserWindow } from 'electron'
import { AudioCaptureService } from './audioCapture'
import { STTEngine } from './sttEngine'
import { StorageManager } from './storageManager'
import { toggleMicAction } from './ipcHandlers'

/**
 * Register global hotkeys:
 * Alt+C / Ctrl+Shift+C — Clipboard question
 * Alt+S / Ctrl+Shift+P — Screenshot question extraction
 * Alt+H / Ctrl+Shift+H — Hide/Show window overlay
 * Alt+R / Ctrl+Shift+R — Refresh/clear session
 * Alt+M / Ctrl+Shift+M — Toggle Mic
 * Ctrl+Shift+S        — Toggle Speaker
 * Ctrl+Up             — Increase Window Opacity
 * Ctrl+Down           — Decrease Window Opacity
 */
export function registerHotkeys(
  win: BrowserWindow,
  audioCapture: AudioCaptureService,
  sttEngine: STTEngine,
  storage?: StorageManager,
) {
  let currentOpacity = 0.88

  if (storage) {
    storage.loadSettings().then(s => {
      if (s && typeof s.windowOpacity === 'number') {
        currentOpacity = s.windowOpacity
      }
    }).catch(() => {})
  }

  const changeOpacity = async (delta: number) => {
    currentOpacity = Math.min(1.0, Math.max(0.20, Math.round((currentOpacity + delta) * 100) / 100))
    try {
      if (win && !win.isDestroyed()) {
        win.setOpacity(currentOpacity)
        win.webContents.send('opacity-change', { opacity: currentOpacity })
      }
      if (storage) {
        await storage.saveSettings({ windowOpacity: currentOpacity })
      }
      console.log(`Window opacity adjusted: ${Math.round(currentOpacity * 100)}%`)
    } catch (err) {
      console.error('Error adjusting window opacity:', err)
    }
  }

  const registerMulti = (keys: string[], handler: () => void, label: string) => {
    for (const key of keys) {
      try {
        const ok = globalShortcut.register(key, handler)
        if (ok) {
          console.log(`[Hotkeys] Registered ${label}: ${key}`)
        } else {
          console.warn(`[Hotkeys] Failed to register ${label}: ${key}`)
        }
      } catch (e) {
        console.warn(`[Hotkeys] Error registering ${label} (${key}):`, e)
      }
    }
  }

  // Opacity Controls: Ctrl+Up and Ctrl+Down
  globalShortcut.register('Control+Up', () => {
    changeOpacity(0.05)
  })

  globalShortcut.register('Control+Down', () => {
    changeOpacity(-0.05)
  })

  // Toggle Mic: Alt+M & Control+Shift+M (uses unified toggleMicAction)
  const handleMicToggle = async () => {
    try {
      await toggleMicAction(win, sttEngine)
    } catch (err) {
      console.error('Hotkey mic toggle error:', err)
    }
  }
  registerMulti(['Alt+M', 'Control+Shift+M'], handleMicToggle, 'Mic Toggle')

  // Toggle Speaker: disabled per user request (unused)
  // globalShortcut.register('Control+Shift+S', ...)

  // Screenshot: Alt+S & Control+Shift+P
  registerMulti(
    ['Alt+S', 'Control+Shift+P'],
    () => {
      win.webContents.send('hotkey-screenshot')
    },
    'Screenshot',
  )

  // Clipboard: Alt+C & Control+Shift+C
  registerMulti(
    ['Alt+C', 'Control+Shift+C'],
    () => {
      win.webContents.send('hotkey-clipboard')
    },
    'Clipboard',
  )

  // Refresh Session: Alt+R & Control+Shift+R
  registerMulti(
    ['Alt+R', 'Control+Shift+R'],
    () => {
      win.webContents.send('hotkey-refresh')
    },
    'Refresh Session',
  )

  // Hide/Show Window: Alt+H & Control+Shift+H
  registerMulti(
    ['Alt+H', 'Control+Shift+H'],
    () => {
      if (win.isVisible()) {
        win.hide()
      } else {
        win.show()
      }
    },
    'Hide/Show Window',
  )

  // Force-send latest transcript as question: Alt+Enter & Alt+Return
  registerMulti(
    ['Alt+Enter', 'Alt+Return'],
    async () => {
      try {
        if ((global as any).sendLastTranscriptAsQuestion) {
          await (global as any).sendLastTranscriptAsQuestion()
        }
      } catch (e) {
        console.error('Hotkey Alt+Enter error:', e)
      }
    },
    'Send Last Transcript'
  )
}
