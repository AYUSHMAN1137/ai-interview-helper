"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHotkeys = registerHotkeys;
const electron_1 = require("electron");
/**
 * Register global hotkeys:
 * Ctrl+Shift+M — Toggle Mic
 * Ctrl+Shift+S — Toggle Speaker
 * Ctrl+Shift+P — Take Screenshot
 * Ctrl+Shift+C — Clipboard question
 * Ctrl+Shift+R — Refresh/clear session
 * Ctrl+Shift+H — Hide/show window
 */
function registerHotkeys(win, audioCapture, sttEngine) {
    let micActive = false;
    // Toggle Mic
    electron_1.globalShortcut.register('Control+Shift+M', async () => {
        try {
            micActive = !micActive;
            if (micActive) {
                await sttEngine.connectSource('mic');
                win.webContents.send('start-mic-capture');
            }
            else {
                win.webContents.send('stop-mic-capture');
                sttEngine.disconnectSource('mic');
            }
            win.webContents.send('hotkey-mic-toggle', { on: micActive });
        }
        catch (err) {
            console.error('Hotkey mic toggle error:', err);
        }
    });
    // Toggle Speaker
    electron_1.globalShortcut.register('Control+Shift+S', async () => {
        try {
            const newState = !audioCapture.isSpeakerOn;
            if (newState) {
                await sttEngine.connectSource('speaker');
                await audioCapture.startLoopback();
                audioCapture.onSpeakerData((chunk) => {
                    sttEngine.sendAudio(chunk, 'speaker');
                });
            }
            else {
                audioCapture.stopLoopback();
                sttEngine.disconnectSource('speaker');
            }
            win.webContents.send('hotkey-speaker-toggle', { on: audioCapture.isSpeakerOn });
        }
        catch (err) {
            console.error('Hotkey speaker toggle error:', err);
        }
    });
    // Screenshot
    electron_1.globalShortcut.register('Control+Shift+P', () => {
        win.webContents.send('hotkey-screenshot');
    });
    // Clipboard
    electron_1.globalShortcut.register('Control+Shift+C', () => {
        win.webContents.send('hotkey-clipboard');
    });
    // Refresh
    electron_1.globalShortcut.register('Control+Shift+R', () => {
        win.webContents.send('hotkey-refresh');
    });
    // Hide/Show window
    electron_1.globalShortcut.register('Control+Shift+H', () => {
        if (win.isVisible()) {
            win.hide();
        }
        else {
            win.show();
        }
    });
}
//# sourceMappingURL=hotkeys.js.map