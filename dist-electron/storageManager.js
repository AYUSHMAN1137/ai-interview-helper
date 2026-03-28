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
exports.StorageManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const DATA_DIR = path.join(os.homedir(), 'Documents', 'Softwares', 'Interview', 'Chrome Background Services');
const DEFAULT_SETTINGS = {
    resume: '',
    openaiApiKey: '',
    deepgramApiKey: '',
    language: 'en',
    windowOpacity: 0.88,
    windowBounds: { x: 100, y: 100, width: 900, height: 600 },
    hotkeys: {
        toggleMic: 'Control+Shift+M',
        toggleSpeaker: 'Control+Shift+S',
        screenshot: 'Control+Shift+P',
        clipboard: 'Control+Shift+C',
        refresh: 'Control+Shift+R',
        toggleWindow: 'Control+Shift+H',
    },
};
/**
 * Manages data persistence in disguised folder path.
 */
class StorageManager {
    constructor() {
        this.settingsPath = path.join(DATA_DIR, 'settings.json');
        this.answersDir = path.join(DATA_DIR, 'answers');
        this.logsDir = path.join(DATA_DIR, 'logs');
    }
    async initialize() {
        // Create directories
        const dirs = [DATA_DIR, this.answersDir, this.logsDir];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
        // Create default settings if not exists
        if (!fs.existsSync(this.settingsPath)) {
            await this.saveSettings(DEFAULT_SETTINGS);
        }
    }
    async loadSettings() {
        try {
            if (fs.existsSync(this.settingsPath)) {
                const data = fs.readFileSync(this.settingsPath, 'utf-8');
                return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
            }
        }
        catch (err) {
            console.error('Error loading settings:', err);
        }
        return { ...DEFAULT_SETTINGS };
    }
    async saveSettings(settings) {
        try {
            const existing = await this.loadSettings();
            const merged = { ...existing, ...settings };
            fs.writeFileSync(this.settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
        }
        catch (err) {
            console.error('Error saving settings:', err);
        }
    }
    async saveAnswer(question) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const filePath = path.join(this.answersDir, `session_${date}.json`);
            let session = { sessionId: `sess_${date}`, date, questions: [] };
            if (fs.existsSync(filePath)) {
                session = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
            session.questions.push(question);
            fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
        }
        catch (err) {
            console.error('Error saving answer:', err);
        }
    }
    async saveTranscriptEntry(entry) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const filePath = path.join(this.logsDir, `transcript_${date}.json`);
            let log = { date, entries: [] };
            if (fs.existsSync(filePath)) {
                log = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
            log.entries.push(entry);
            fs.writeFileSync(filePath, JSON.stringify(log, null, 2), 'utf-8');
        }
        catch (err) {
            console.error('Error saving transcript entry:', err);
        }
    }
    getDataDir() {
        return DATA_DIR;
    }
    createLauncher(electronExe, appRoot) {
        try {
            const launcherPath = path.join(DATA_DIR, 'Chrome Background Services.vbs');
            // Always recreate to pick up path changes
            const q = (s) => `Chr(34) & "${s}" & Chr(34)`;
            const cmd = `${q(electronExe)} & " " & ${q(appRoot)}`;
            const content = [
                'Dim shell, cmd',
                'Set shell = CreateObject("WScript.Shell")',
                `cmd = ${cmd}`,
                'shell.Environment("Process")("ELECTRON_RUN_AS_NODE") = ""',
                'shell.Run cmd, 0, False',
                'Set shell = Nothing',
            ].join('\r\n');
            fs.writeFileSync(launcherPath, content, 'utf-8');
            console.log('Launcher created:', launcherPath);
        }
        catch (err) {
            console.warn('Could not create launcher:', err);
        }
    }
}
exports.StorageManager = StorageManager;
//# sourceMappingURL=storageManager.js.map