"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageTracker = void 0;
/**
 * Usage tracker — tracks session time.
 * No daily limits (personal use) — just displays session duration.
 */
class UsageTracker {
    constructor(storage) {
        this.sessionStartTime = null;
        this.totalSessionMinutes = 0;
        this.timerInterval = null;
        this.mainWindow = null;
        this.storage = storage;
    }
    setMainWindow(win) {
        this.mainWindow = win;
    }
    startSession() {
        this.sessionStartTime = Date.now();
        this.totalSessionMinutes = 0;
        // Tick every minute
        this.timerInterval = setInterval(() => {
            this.totalSessionMinutes++;
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('usage-update', this.getUsageInfo());
            }
        }, 60000);
    }
    stopSession() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    getUsageInfo() {
        const elapsedMs = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
        const usedMinutes = Math.floor(elapsedMs / 60000);
        return {
            usedMinutes,
            formattedUsed: this.formatTime(usedMinutes),
            sessionActive: this.sessionStartTime !== null,
        };
    }
    formatTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${m}m`;
    }
}
exports.UsageTracker = UsageTracker;
//# sourceMappingURL=usageTracker.js.map