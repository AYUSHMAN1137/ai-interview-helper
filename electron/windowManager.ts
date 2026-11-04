import { BrowserWindow } from 'electron'
import * as path from 'path'

// Track whether WDA_EXCLUDEFROMCAPTURE is active (truly invisible, not just black rectangle)
let wdaExcludeActive = false

export function isWdaExcludeActive(): boolean {
  return wdaExcludeActive
}

// ─── Win32 constants for taskbar suppression ────────────────────────────────
// Windows puts a taskbar button on any visible top-level window that has
// WS_EX_APPWINDOW, and APPWINDOW wins over TOOLWINDOW when both bits are set.
const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_APPWINDOW = 0x00040000

// SetWindowPos flags — used to force the shell to re-read the window style
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOZORDER = 0x0004
const SWP_NOACTIVATE = 0x0010
const SWP_FRAMECHANGED = 0x0020

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
    // CRITICAL: stay hidden until the taskbar styles are applied in ready-to-show.
    // Showing on construction lets Windows register a taskbar button before we can
    // touch the window styles — and a button that already exists is far harder to
    // remove than one that was never created.
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
  })

  win.setAlwaysOnTop(true, 'screen-saver', 1)
  // Reinforce skipTaskbar at runtime — Windows sometimes ignores the constructor flag
  win.setSkipTaskbar(true)
  // Native enforcement — see hideFromTaskbar() for why Electron's flag alone is not enough
  hideFromTaskbar(win, 'main')

  return win
}

/**
 * Hard-hide a window from the Windows taskbar at the native level.
 *
 * Why this is needed: Electron's `skipTaskbar` / `setSkipTaskbar(true)` only *sets*
 * WS_EX_TOOLWINDOW on the HWND. It does NOT clear WS_EX_APPWINDOW, and Windows
 * prioritises WS_EX_APPWINDOW — so a transparent / frameless / always-on-top window
 * can keep its taskbar button no matter what you pass to the BrowserWindow constructor.
 *
 * This strips WS_EX_APPWINDOW, sets WS_EX_TOOLWINDOW, then fires a SWP_FRAMECHANGED
 * SetWindowPos so the shell re-evaluates the window and removes the button instantly.
 * (Without SWP_FRAMECHANGED the change is often not picked up until the window is
 * recreated.)
 *
 * @param label only used for logging, so failures are attributable
 * @returns true if the native call chain succeeded
 */
export function hideFromTaskbar(win: BrowserWindow, label = 'main'): boolean {
  try {
    if (!win || win.isDestroyed()) return false

    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')

    // Same call convention as the proven WDA path below — `long` + readInt32LE
    const GetWindowLongW = user32.func('long __stdcall GetWindowLongW(long hWnd, int nIndex)')
    const SetWindowLongW = user32.func('long __stdcall SetWindowLongW(long hWnd, int nIndex, long dwNewLong)')
    const SetWindowPos = user32.func(
      'bool __stdcall SetWindowPos(long hWnd, long hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)'
    )

    const hwndBuf = win.getNativeWindowHandle()
    // 'browser-window-created' fires before the native window exists — bail out and let
    // the ready-to-show / post-load passes do the real work.
    if (!hwndBuf || hwndBuf.length < 4) return false
    const hwnd = hwndBuf.readInt32LE(0)
    if (!hwnd) return false

    const exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE)
    const newStyle = (exStyle | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW

    if (newStyle !== exStyle) {
      SetWindowLongW(hwnd, GWL_EXSTYLE, newStyle)
    }

    // Force the shell to drop the taskbar button right now
    SetWindowPos(
      hwnd,
      0,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED
    )

    const hadAppWindow = (exStyle & WS_EX_APPWINDOW) !== 0
    console.log(
      `✓ [taskbar] ${label} is a tool window ` +
        `(exStyle 0x${(exStyle >>> 0).toString(16)} → 0x${(newStyle >>> 0).toString(16)}` +
        `${hadAppWindow ? ', WS_EX_APPWINDOW stripped' : ''})`
    )

    // Read the style back. Without this we are only ASSUMING the write landed —
    // and if the shell already created a taskbar button, assuming is not good enough.
    const after = GetWindowLongW(hwnd, GWL_EXSTYLE)
    if ((after & WS_EX_APPWINDOW) !== 0) {
      console.warn(
        `[taskbar] ${label}: WS_EX_APPWINDOW is STILL SET after write ` +
          `(0x${(after >>> 0).toString(16)}) — a taskbar button will remain visible. ` +
          `Run tools/check-taskbar.ps1 to inspect all windows.`
      )
      return false
    }
    if ((after & WS_EX_TOOLWINDOW) === 0) {
      console.warn(
        `[taskbar] ${label}: WS_EX_TOOLWINDOW did not stick ` +
          `(0x${(after >>> 0).toString(16)}) — Windows may still show a button.`
      )
      return false
    }

    return true
  } catch (e: any) {
    console.warn(`[taskbar] hideFromTaskbar(${label}) failed:`, e?.message || e)
    return false
  }
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

  // Re-apply on every show — hide/show can reset display affinity AND window styles
  win.on('show', () => {
    setTimeout(() => {
      const reapplied = applyWdaInvisibility(win)
      if (reapplied) {
        console.log('✓ WDA re-applied after window show')
      }
      // Windows can also re-add WS_EX_APPWINDOW when a window is re-shown,
      // which would bring the taskbar button back — enforce it again here.
      hideFromTaskbar(win, 'main(re-show)')
    }, 100)
  })
}
