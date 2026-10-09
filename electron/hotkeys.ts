import { globalShortcut, BrowserWindow } from 'electron'
import { AudioCaptureService } from './audioCapture'
import { STTEngine } from './sttEngine'
import { StorageManager } from './storageManager'

/**
 * Register global hotkeys:
 * Ctrl+Shift+M — Toggle Mic
 * Ctrl+Shift+S — Toggle Speaker
 * Ctrl+Shift+P — Take Screenshot
 * Ctrl+Shift+C — Clipboard question
 * Ctrl+Shift+R — Refresh/clear session
 * Ctrl+Shift+H — Hide/show window
 * Ctrl+Up      — Increase Window Opacity
 * Ctrl+Down    — Decrease Window Opacity
 */
export function registerHotkeys(
  win: BrowserWindow,
  audioCapture: AudioCaptureService,
  sttEngine: STTEngine,
  storage?: StorageManager,
) {
  let micActive = false
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

  // Opacity Controls: Ctrl+Up and Ctrl+Down
  globalShortcut.register('Control+Up', () => {
    changeOpacity(0.05)
  })

  globalShortcut.register('Control+Down', () => {
    changeOpacity(-0.05)
  })

  // Toggle Mic
  globalShortcut.register('Control+Shift+M', async () => {
    try {
      micActive = !micActive
      if (micActive) {
        await sttEngine.connectSource('mic')
        win.webContents.send('start-mic-capture')
      } else {
        win.webContents.send('stop-mic-capture')
        sttEngine.disconnectSource('mic')
      }
      win.webContents.send('hotkey-mic-toggle', { on: micActive })
    } catch (err) {
      console.error('Hotkey mic toggle error:', err)
    }
  })

  // Toggle Speaker
  globalShortcut.register('Control+Shift+S', async () => {
    try {
      const newState = !audioCapture.isSpeakerOn
      if (newState) {
        await sttEngine.connectSource('speaker')
        await audioCapture.startLoopback()
        audioCapture.onSpeakerData((chunk: Buffer) => {
          sttEngine.sendAudio(chunk, 'speaker')
        })
      } else {
        audioCapture.stopLoopback()
        sttEngine.disconnectSource('speaker')
      }
      win.webContents.send('hotkey-speaker-toggle', { on: audioCapture.isSpeakerOn })
    } catch (err) {
      console.error('Hotkey speaker toggle error:', err)
    }
  })

  // Screenshot
  globalShortcut.register('Control+Shift+P', () => {
    win.webContents.send('hotkey-screenshot')
  })

  // Clipboard
  globalShortcut.register('Control+Shift+C', () => {
    win.webContents.send('hotkey-clipboard')
  })

  // Refresh
  globalShortcut.register('Control+Shift+R', () => {
    win.webContents.send('hotkey-refresh')
  })

  // Hide/Show window
  globalShortcut.register('Control+Shift+H', () => {
    if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
    }
  })
}
