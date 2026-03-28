"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIpcHandlers = registerIpcHandlers;
const electron_1 = require("electron");
function registerIpcHandlers(win, audioCapture, sttEngine, llmEngine, screenshotService, usageTracker, storage, questionDetector, processNewQuestion) {
    let micOn = false;
    electron_1.ipcMain.handle('toggle-mic', async (_event, { on }) => {
        try {
            if (on) {
                // Connect Deepgram mic on-demand (avoids timeout from startup connection)
                const connected = await sttEngine.connectSource('mic');
                if (!connected) {
                    console.warn('Deepgram mic connection failed — mic audio will not be transcribed');
                }
                micOn = true;
                // Signal renderer to start Web Audio mic capture
                win.webContents.send('start-mic-capture');
            }
            else {
                micOn = false;
                win.webContents.send('stop-mic-capture');
                sttEngine.disconnectSource('mic');
            }
            return { success: true, on: micOn };
        }
        catch (err) {
            console.error('Mic toggle error:', err);
            return { success: false, error: err.message, on: false };
        }
    });
    // Receive mic audio chunks from renderer (Web Audio API - no SoX needed)
    electron_1.ipcMain.on('mic-audio-chunk', (_event, data) => {
        if (micOn) {
            // IPC serialization may convert Buffer to Uint8Array — convert back
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            sttEngine.sendAudio(buf, 'mic');
        }
    });
    electron_1.ipcMain.handle('toggle-speaker', async (_event, { on }) => {
        try {
            if (on) {
                // Connect Deepgram speaker on-demand
                const connected = await sttEngine.connectSource('speaker');
                if (!connected) {
                    console.warn('Deepgram speaker connection failed');
                }
                await audioCapture.startLoopback();
                if (audioCapture.isSpeakerOn) {
                    audioCapture.onSpeakerData((chunk) => {
                        sttEngine.sendAudio(chunk, 'speaker');
                    });
                }
            }
            else {
                audioCapture.stopLoopback();
                sttEngine.disconnectSource('speaker');
            }
            return { success: true, on: on && audioCapture.isSpeakerOn };
        }
        catch (err) {
            console.error('Speaker toggle error:', err);
            return { success: false, error: err.message, on: false };
        }
    });
    electron_1.ipcMain.handle('trigger-screenshot', async () => {
        win.webContents.send('scanning-status', { status: 'started' });
        try {
            // desktopCapturer uses WinRT/DirectX which respects WDA_EXCLUDEFROMCAPTURE.
            // The overlay is automatically invisible — no need to hide or set opacity.
            const ocrText = await screenshotService.captureAndOCR();
            if (!ocrText || ocrText.trim().length < 5) {
                win.webContents.send('scanning-status', { status: 'done', message: 'No text detected' });
                return { success: false, message: 'No text detected in screenshot' };
            }
            win.webContents.send('scanning-status', { status: 'processing' });
            const question = await screenshotService.extractQuestion(ocrText);
            console.log('Extracted question:', question);
            if (question) {
                await processNewQuestion(question, 'screenshot');
                win.webContents.send('scanning-status', { status: 'done' });
                return { success: true, question };
            }
            else {
                win.webContents.send('scanning-status', { status: 'done', message: 'No question found' });
                return { success: false, message: 'No question found in screenshot' };
            }
        }
        catch (err) {
            console.error('Screenshot error:', err);
            win.webContents.send('scanning-status', { status: 'error', message: err.message });
            return { success: false, error: err.message };
        }
    });
    electron_1.ipcMain.handle('trigger-clipboard', async () => {
        try {
            const text = electron_1.clipboard.readText().trim();
            if (text && text.length > 2) {
                await processNewQuestion(text, 'clipboard');
                return { success: true, text };
            }
            return { success: false, message: 'Clipboard is empty' };
        }
        catch (err) {
            console.error('Clipboard error:', err);
            return { success: false, error: err.message };
        }
    });
    electron_1.ipcMain.handle('add-clipboard-question', async (_event, { text }) => {
        if (text && text.trim().length > 2) {
            await processNewQuestion(text.trim(), 'clipboard');
            return { success: true };
        }
        return { success: false, message: 'Text too short' };
    });
    electron_1.ipcMain.handle('refresh-session', async () => {
        global.__questionCounter = 0;
        llmEngine.clearHistory();
        return { success: true };
    });
    electron_1.ipcMain.handle('save-settings', async (_event, settings) => {
        await storage.saveSettings(settings);
        if (settings.resume !== undefined) {
            llmEngine.updateResume(settings.resume);
        }
        if (settings.openaiApiKey) {
            llmEngine.updateApiKey(settings.openaiApiKey);
            screenshotService.updateApiKey(settings.openaiApiKey);
        }
        if (settings.deepgramApiKey) {
            sttEngine.updateApiKey(settings.deepgramApiKey);
        }
        return { success: true };
    });
    electron_1.ipcMain.handle('load-settings', async () => {
        return await storage.loadSettings();
    });
    electron_1.ipcMain.handle('get-usage', async () => {
        return usageTracker.getUsageInfo();
    });
    electron_1.ipcMain.handle('minimize-window', () => {
        win.hide(); // Hide to system tray instead of minimize (since skipTaskbar=true)
    });
    electron_1.ipcMain.handle('close-window', () => {
        electron_1.app.quit();
    });
}
//# sourceMappingURL=ipcHandlers.js.map