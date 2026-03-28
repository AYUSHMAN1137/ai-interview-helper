import { BrowserWindow } from 'electron'
import * as path from 'path'

// Track whether WDA_EXCLUDEFROMCAPTURE is active (truly invisible, not just black rectangle)
let wdaExcludeActive = false

export function isWdaExcludeActive(): boolean {
  return wdaExcludeActive
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    focusable: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver', 1)

  return win
}

/**
 * Apply WDA_EXCLUDEFROMCAPTURE to make window completely invisible to screen capture.
 * Must be re-applied every time the window is shown (hide/show resets it).
 */
export function applyWdaInvisibility(win: BrowserWindow): boolean {
  try {
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')

    const GetWindowLongW = user32.func('long __stdcall GetWindowLongW(long hWnd, int nIndex)')
    const SetWindowLongW = user32.func('long __stdcall SetWindowLongW(long hWnd, int nIndex, long dwNewLong)')
    const SetWindowDisplayAffinity = user32.func('bool __stdcall SetWindowDisplayAffinity(long hWnd, uint32_t dwAffinity)')

    const hwndBuf = win.getNativeWindowHandle()
    const hwnd = hwndBuf.readInt32LE(0)

    const GWL_EXSTYLE = -20
    const WS_EX_LAYERED = 0x80000

    const exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE)
    const wasLayered = (exStyle & WS_EX_LAYERED) !== 0

    // Temporarily remove WS_EX_LAYERED (SetWindowDisplayAffinity fails on layered windows)
    if (wasLayered) {
      SetWindowLongW(hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_LAYERED)
    }

    const result = SetWindowDisplayAffinity(hwnd, 0x00000011) // WDA_EXCLUDEFROMCAPTURE

    // Restore WS_EX_LAYERED
    if (wasLayered) {
      SetWindowLongW(hwnd, GWL_EXSTYLE, exStyle)
    }

    wdaExcludeActive = result
    return result
  } catch (e: any) {
    console.warn('applyWdaInvisibility failed:', e.message)
    return false
  }
}

/**
 * Initial setup: apply invisibility + set up auto-reapply on window show.
 */
export function hideFromScreenCapture(win: BrowserWindow) {
  // Apply WDA_EXCLUDEFROMCAPTURE (makes window truly invisible to all capture)
  const success = applyWdaInvisibility(win)

  if (success) {
    console.log('✓ Window is INVISIBLE to screen capture (WDA_EXCLUDEFROMCAPTURE)')
    // Do NOT enable setContentProtection — it's redundant and would show a black rectangle
    // WDA_EXCLUDEFROMCAPTURE already provides complete invisibility
  } else {
    // Fallback: setContentProtection shows black rectangle (better than being fully visible)
    try {
      win.setContentProtection(true)
      console.log('Fallback: setContentProtection enabled (shows black rectangle)')
    } catch (e) {
      console.warn('setContentProtection also failed:', e)
    }
  }

  // Re-apply WDA every time the window is shown (hide/show can reset display affinity)
  win.on('show', () => {
    setTimeout(() => {
      const reapplied = applyWdaInvisibility(win)
      if (reapplied) {
        console.log('✓ WDA re-applied after window show')
      }
    }, 100)
  })
}
