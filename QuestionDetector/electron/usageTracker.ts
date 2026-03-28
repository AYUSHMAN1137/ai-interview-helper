import { StorageManager } from './storageManager'

/**
 * Usage tracker — tracks session time.
 * No daily limits (personal use) — just displays session duration.
 */
export class UsageTracker {
  private storage: StorageManager
  private sessionStartTime: number | null = null
  private totalSessionMinutes = 0
  private timerInterval: NodeJS.Timeout | null = null
  private mainWindow: any = null

  constructor(storage: StorageManager) {
    this.storage = storage
  }

  setMainWindow(win: any): void {
    this.mainWindow = win
  }

  startSession(): void {
    this.sessionStartTime = Date.now()
    this.totalSessionMinutes = 0

    // Tick every minute
    this.timerInterval = setInterval(() => {
      this.totalSessionMinutes++
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('usage-update', this.getUsageInfo())
      }
    }, 60_000)
  }

  stopSession(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  getUsageInfo() {
    const elapsedMs = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0
    const usedMinutes = Math.floor(elapsedMs / 60_000)

    return {
      usedMinutes,
      formattedUsed: this.formatTime(usedMinutes),
      sessionActive: this.sessionStartTime !== null,
    }
  }

  private formatTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }
}
