"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Renderer → Main
    toggleMic: (on) => electron_1.ipcRenderer.invoke('toggle-mic', { on }),
    toggleSpeaker: (on) => electron_1.ipcRenderer.invoke('toggle-speaker', { on }),
    triggerScreenshot: () => electron_1.ipcRenderer.invoke('trigger-screenshot'),
    triggerClipboard: () => electron_1.ipcRenderer.invoke('trigger-clipboard'),
    refreshSession: () => electron_1.ipcRenderer.invoke('refresh-session'),
    saveSettings: (settings) => electron_1.ipcRenderer.invoke('save-settings', settings),
    loadSettings: () => electron_1.ipcRenderer.invoke('load-settings'),
    getUsage: () => electron_1.ipcRenderer.invoke('get-usage'),
    minimizeWindow: () => electron_1.ipcRenderer.invoke('minimize-window'),
    closeWindow: () => electron_1.ipcRenderer.invoke('close-window'),
    addClipboardQuestion: (text) => electron_1.ipcRenderer.invoke('add-clipboard-question', { text }),
    // Mic audio chunk (renderer → main, Web Audio API)
    sendMicAudio: (buffer) => electron_1.ipcRenderer.send('mic-audio-chunk', Buffer.from(buffer)),
    // Main → Renderer listeners
    onNewQuestion: (cb) => {
        electron_1.ipcRenderer.on('new-question', (_event, data) => cb(data));
    },
    onAnswerChunk: (cb) => {
        electron_1.ipcRenderer.on('answer-stream-chunk', (_event, data) => cb(data));
    },
    onTranscriptEntry: (cb) => {
        electron_1.ipcRenderer.on('transcript-entry', (_event, data) => cb(data));
    },
    onUsageUpdate: (cb) => {
        electron_1.ipcRenderer.on('usage-update', (_event, data) => cb(data));
    },
    onScanningStatus: (cb) => {
        electron_1.ipcRenderer.on('scanning-status', (_event, data) => cb(data));
    },
    onHotkeyMicToggle: (cb) => {
        electron_1.ipcRenderer.on('hotkey-mic-toggle', (_event, data) => cb(data));
    },
    onHotkeySpeakerToggle: (cb) => {
        electron_1.ipcRenderer.on('hotkey-speaker-toggle', (_event, data) => cb(data));
    },
    onHotkeyScreenshot: (cb) => {
        electron_1.ipcRenderer.on('hotkey-screenshot', () => cb());
    },
    onHotkeyClipboard: (cb) => {
        electron_1.ipcRenderer.on('hotkey-clipboard', () => cb());
    },
    onHotkeyRefresh: (cb) => {
        electron_1.ipcRenderer.on('hotkey-refresh', () => cb());
    },
    onStartMicCapture: (cb) => {
        electron_1.ipcRenderer.on('start-mic-capture', () => cb());
    },
    onStopMicCapture: (cb) => {
        electron_1.ipcRenderer.on('stop-mic-capture', () => cb());
    },
    // Cleanup
    removeAllListeners: (channel) => {
        electron_1.ipcRenderer.removeAllListeners(channel);
    },
});
//# sourceMappingURL=preload.js.map