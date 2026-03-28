import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const DATA_DIR = path.join(
  os.homedir(),
  'Documents', 'Softwares', 'Interview', 'Chrome Background Services'
)

interface Settings {
  resume: string
  openaiApiKey: string
  deepgramApiKey: string
  language: string
  windowOpacity: number
  windowBounds: { x: number; y: number; width: number; height: number }
  hotkeys: Record<string, string>
  [key: string]: any
}

const DEFAULT_SETTINGS: Settings = {
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
}

/**
 * Manages data persistence in disguised folder path.
 */
export class StorageManager {
  private settingsPath: string
  private answersDir: string
  private logsDir: string

  constructor() {
    this.settingsPath = path.join(DATA_DIR, 'settings.json')
    this.answersDir = path.join(DATA_DIR, 'answers')
    this.logsDir = path.join(DATA_DIR, 'logs')
  }

  async initialize(): Promise<void> {
    // Create directories
    const dirs = [DATA_DIR, this.answersDir, this.logsDir]
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }

    // Create default settings if not exists
    if (!fs.existsSync(this.settingsPath)) {
      await this.saveSettings(DEFAULT_SETTINGS)
    }
  }

  async loadSettings(): Promise<Settings> {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8')
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
      }
    } catch (err) {
      console.error('Error loading settings:', err)
    }
    return { ...DEFAULT_SETTINGS }
  }

  async saveSettings(settings: Partial<Settings>): Promise<void> {
    try {
      const existing = await this.loadSettings()
      const merged = { ...existing, ...settings }
      fs.writeFileSync(this.settingsPath, JSON.stringify(merged, null, 2), 'utf-8')
    } catch (err) {
      console.error('Error saving settings:', err)
    }
  }

  async saveAnswer(question: any): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0]
      const filePath = path.join(this.answersDir, `session_${date}.json`)

      let session: any = { sessionId: `sess_${date}`, date, questions: [] }
      if (fs.existsSync(filePath)) {
        session = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      }

      session.questions.push(question)
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8')
    } catch (err) {
      console.error('Error saving answer:', err)
    }
  }

  async saveTranscriptEntry(entry: any): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0]
      const filePath = path.join(this.logsDir, `transcript_${date}.json`)

      let log: any = { date, entries: [] }
      if (fs.existsSync(filePath)) {
        log = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      }

      log.entries.push(entry)
      fs.writeFileSync(filePath, JSON.stringify(log, null, 2), 'utf-8')
    } catch (err) {
      console.error('Error saving transcript entry:', err)
    }
  }

  getDataDir(): string {
    return DATA_DIR
  }

  createLauncher(electronExe: string, appRoot: string): void {
    try {
      const launcherPath = path.join(DATA_DIR, 'Chrome Background Services.vbs')
      // Always recreate to pick up path changes
      const q = (s: string) => `Chr(34) & "${s}" & Chr(34)`
      const cmd = `${q(electronExe)} & " " & ${q(appRoot)}`
      const content = [
        'Dim shell, cmd',
        'Set shell = CreateObject("WScript.Shell")',
        `cmd = ${cmd}`,
        'shell.Environment("Process")("ELECTRON_RUN_AS_NODE") = ""',
        'shell.Run cmd, 0, False',
        'Set shell = Nothing',
      ].join('\r\n')
      fs.writeFileSync(launcherPath, content, 'utf-8')
      console.log('Launcher created:', launcherPath)
    } catch (err) {
      console.warn('Could not create launcher:', err)
    }
  }
}
