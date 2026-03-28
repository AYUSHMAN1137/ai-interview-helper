"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const windowManager_1 = require("./windowManager");
const ipcHandlers_1 = require("./ipcHandlers");
const sttEngine_1 = require("./sttEngine");
const llmEngine_1 = require("./llmEngine");
const screenshotCapture_1 = require("./screenshotCapture");
const storageManager_1 = require("./storageManager");
const questionDetector_1 = require("./questionDetector");
const audioCapture_1 = require("./audioCapture");
const hotkeys_1 = require("./hotkeys");
const usageTracker_1 = require("./usageTracker");
let mainWindow = null;
let tray = null;
let sttEngine = null;
let llmEngine = null;
let screenshotService = null;
let storageManager = null;
let questionDetector = null;
let audioCaptureService = null;
let usageTracker = null;
function loadEnvFile() {
    try {
        const fs = require('fs');
        const envPath = path.join(electron_1.app.isPackaged ? path.dirname(process.execPath) : __dirname, '..', '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            content.split('\n').forEach((line) => {
                const [key, ...vals] = line.split('=');
                if (key && vals.length) {
                    process.env[key.trim()] = vals.join('=').trim();
                }
            });
        }
    }
    catch (e) {
        console.warn('Could not load .env file:', e);
    }
}
async function createTrayIcon() {
    try {
        const fs = require('fs');
        const sharp = require('sharp');
        const iconPath = path.join(electron_1.app.getPath('userData'), 'tray-icon.png');
        if (!fs.existsSync(iconPath)) {
            await sharp({
                create: { width: 16, height: 16, channels: 4, background: { r: 34, g: 197, b: 94, alpha: 1 } },
            }).png().toFile(iconPath);
        }
        return electron_1.nativeImage.createFromPath(iconPath);
    }
    catch {
        return electron_1.nativeImage.createEmpty();
    }
}
function setupTray() {
    createTrayIcon().then(icon => {
        tray = new electron_1.Tray(icon);
        tray.setToolTip('Chrome Background Services');
        const contextMenu = electron_1.Menu.buildFromTemplate([
            {
                label: 'Show Window', click: () => {
                    mainWindow?.show();
                    mainWindow?.focus();
                    mainWindow?.setAlwaysOnTop(true, 'screen-saver', 1);
                }
            },
            { label: 'Hide Window', click: () => mainWindow?.hide() },
            { type: 'separator' },
            { label: 'Quit', click: () => electron_1.app.quit() },
        ]);
        tray.setContextMenu(contextMenu);
        tray.on('click', () => {
            if (!mainWindow)
                return;
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            }
            else {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
            }
        });
    }).catch(err => console.warn('Tray setup failed:', err));
}
async function initializeServices() {
    storageManager = new storageManager_1.StorageManager();
    await storageManager.initialize();
    const settings = await storageManager.loadSettings();
    // Use settings API keys if available, fallback to env
    const openaiKey = settings.openaiApiKey || process.env.GROQ_API_KEY || '';
    const deepgramKey = settings.deepgramApiKey || process.env.DEEPGRAM_API_KEY || '';
    llmEngine = new llmEngine_1.LLMEngine(openaiKey, settings.resume || '');
    screenshotService = new screenshotCapture_1.ScreenshotService(openaiKey);
    questionDetector = new questionDetector_1.QuestionDetector();
    usageTracker = new usageTracker_1.UsageTracker(storageManager);
    sttEngine = new sttEngine_1.STTEngine(deepgramKey);
    audioCaptureService = new audioCapture_1.AudioCaptureService();
    // STT connections are now ON-DEMAND (connectSource called when mic/speaker enabled)
    // Do NOT call sttEngine.connect() here — it would timeout before user enables mic
    // Wire up STT events
    sttEngine.on('transcript', (data) => {
        if (!mainWindow)
            return;
        mainWindow.webContents.send('transcript-entry', data);
        // Detect questions from BOTH Interviewer and Candidate speech
        // Interviewer questions are the primary use case, but Candidate speech
        // can also contain questions (e.g., user testing, or reading a question aloud)
        if (data.isFinal) {
            const isQ = questionDetector.isQuestion(data.text);
            if (isQ) {
                processNewQuestion(data.text, 'voice');
            }
        }
    });
}
async function processNewQuestion(text, source) {
    if (!mainWindow || !llmEngine || !storageManager)
        return;
    const questionId = `q_${Date.now()}`;
    const questionNumber = global.__questionCounter = (global.__questionCounter || 0) + 1;
    const question = {
        id: questionId,
        number: questionNumber,
        text: text,
        answer: '',
        isStreaming: true,
        detectedFrom: source,
        timestamp: new Date().toISOString(),
    };
    mainWindow.webContents.send('new-question', { question });
    try {
        const stream = await llmEngine.generateAnswerStream(text);
        let fullAnswer = '';
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || '';
            if (delta) {
                fullAnswer += delta;
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('answer-stream-chunk', {
                        questionId,
                        chunk: delta,
                        isDone: false,
                    });
                }
            }
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('answer-stream-chunk', {
                questionId,
                chunk: '',
                isDone: true,
            });
        }
        // Save to storage
        storageManager.saveAnswer({
            ...question,
            answer: fullAnswer,
            isStreaming: false,
        });
    }
    catch (err) {
        console.error('LLM error:', err);
        mainWindow.webContents.send('answer-stream-chunk', {
            questionId,
            chunk: `\n\n_Error generating answer: ${err.message}_`,
            isDone: true,
        });
    }
}
electron_1.app.whenReady().then(async () => {
    loadEnvFile();
    await initializeServices();
    mainWindow = (0, windowManager_1.createMainWindow)();
    // Load the renderer
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }
    // Apply invisibility AFTER window content loads (SetWindowDisplayAffinity needs a visible window)
    mainWindow.webContents.on('did-finish-load', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            setTimeout(() => {
                (0, windowManager_1.hideFromScreenCapture)(mainWindow);
            }, 500); // Small delay to ensure window is fully rendered
        }
    });
    // Open devtools in development
    if (!electron_1.app.isPackaged) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    // Register IPC handlers
    (0, ipcHandlers_1.registerIpcHandlers)(mainWindow, audioCaptureService, sttEngine, llmEngine, screenshotService, usageTracker, storageManager, questionDetector, processNewQuestion);
    // Register global hotkeys
    (0, hotkeys_1.registerHotkeys)(mainWindow, audioCaptureService, sttEngine);
    // Wire usage tracker to window for IPC updates
    usageTracker.setMainWindow(mainWindow);
    // Start usage tracking
    usageTracker.startSession();
    // Create launcher in disguised data dir for easy access
    storageManager.createLauncher(electron_1.app.isPackaged ? process.execPath : path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe'), electron_1.app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..'));
    // Set up system tray
    setupTray();
    mainWindow.on('close', (e) => {
        // 'close' is from Exit button (win.close()) — allow it.
        // But intercept OS close button clicks to hide instead? No — Exit means quit.
        mainWindow = null;
    });
});
electron_1.app.on('window-all-closed', () => {
    electron_1.globalShortcut.unregisterAll();
    usageTracker?.stopSession();
    sttEngine?.close();
    audioCaptureService?.stopAll();
    tray?.destroy();
    electron_1.app.quit();
});
electron_1.app.on('will-quit', () => {
    electron_1.globalShortcut.unregisterAll();
});
global.processNewQuestion = function (text, source) {
    return processNewQuestion(text, source);
};
//# sourceMappingURL=main.js.map