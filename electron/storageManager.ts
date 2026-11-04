import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type {
  QuestionRecord,
  SessionRun,
  SessionRunSummary,
  AnswerOutputMode,
  SessionTimelineEvent,
} from './answerTypes'

const DATA_DIR = path.join(
  os.homedir(),
  'Documents', 'Softwares', 'Interview', 'Chrome Background Services'
)

interface Settings {
  resume: string
  openaiApiKey: string
  deepgramApiKey: string
  model: string
  answerMode?: 'auto' | 'instant' | 'balanced' | 'deep'
  answerOutputMode?: AnswerOutputMode
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
  model: 'openai/gpt-oss-120b',
  answerOutputMode: 'both',
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
 * Saves ONE organized session JSON file per interview run containing:
 *  - Session metadata & statistics
 *  - Chronological timeline (every final transcript, question turn, and prompt/latency audit)
 *  - UI-ready question records
 */
export class StorageManager {
  private settingsPath: string
  private answersDir: string
  private logsDir: string
  private currentRun: SessionRun | null = null
  private currentRunPath: string | null = null

  constructor() {
    this.settingsPath = path.join(DATA_DIR, 'settings.json')
    this.answersDir = path.join(DATA_DIR, 'answers')
    this.logsDir = path.join(DATA_DIR, 'logs')
  }

  async initialize(): Promise<void> {
    const dirs = [DATA_DIR, this.answersDir, this.logsDir]
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }

    if (!fs.existsSync(this.settingsPath)) {
      await this.saveSettings(DEFAULT_SETTINGS)
    }

    this.markInterruptedRuns()
  }

  private markInterruptedRuns(): void {
    try {
      if (!fs.existsSync(this.answersDir)) return
      const files = fs.readdirSync(this.answersDir).filter(f => f.endsWith('.json'))
      for (const file of files) {
        const filePath = path.join(this.answersDir, file)
        try {
          const raw = fs.readFileSync(filePath, 'utf-8')
          const data: SessionRun = JSON.parse(raw)
          let modified = false
          if (data && Array.isArray(data.questions)) {
            for (const q of data.questions) {
              if (q.simpleStatus === 'streaming' || q.simpleStatus === 'pending') {
                q.simpleStatus = 'interrupted'
                if (q.simplePipeline) q.simplePipeline.status = 'interrupted'
                modified = true
              }
              if (q.contextualStatus === 'streaming' || q.contextualStatus === 'pending') {
                q.contextualStatus = 'interrupted'
                if (q.contextualPipeline) q.contextualPipeline.status = 'interrupted'
                modified = true
              }
              if (q.isStreaming) {
                q.isStreaming = false
                modified = true
              }
            }
          }
          if (data && Array.isArray(data.timeline)) {
            for (const item of data.timeline) {
              if (item.type === 'question_turn') {
                if (item.simplePipeline && (item.simplePipeline.status === 'streaming' || item.simplePipeline.status === 'pending')) {
                  item.simplePipeline.status = 'interrupted'
                  modified = true
                }
                if (item.contextualPipeline && (item.contextualPipeline.status === 'streaming' || item.contextualPipeline.status === 'pending')) {
                  item.contextualPipeline.status = 'interrupted'
                  modified = true
                }
              }
            }
          }
          if (!data.endedAt) {
            data.endedAt = data.startedAt
            modified = true
          }
          if (modified) {
            this.safeWriteJson(filePath, data)
          }
        } catch { /* ignore corrupted run */ }
      }
    } catch (e) {
      console.warn('Could not scan prior runs:', e)
    }
  }

  private safeWriteJson(filePath: string, data: any): void {
    const tmp = `${filePath}.tmp_${Date.now()}`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmp, filePath)
  }

  /**
   * Starts a new session run for this app launch.
   */
  async startSessionRun(): Promise<SessionRun> {
    const now = new Date()
    const iso = now.toISOString()
    const date = iso.split('T')[0]
    const rand = Math.random().toString(36).substring(2, 7)
    const sessionId = `session_${Date.now()}_${rand}`
    const fileName = `${sessionId}.json`

    this.currentRunPath = path.join(this.answersDir, fileName)
    this.currentRun = {
      sessionId,
      startedAt: iso,
      date,
      stats: {
        totalQuestions: 0,
        totalTranscripts: 0,
      },
      timeline: [],
      questions: [],
    }

    try {
      this.safeWriteJson(this.currentRunPath, this.currentRun)
      console.log(`[Storage] Started new session run: ${sessionId}`)
    } catch (err) {
      console.error('[Storage] Error starting session run:', err)
    }

    return this.currentRun
  }

  /**
   * Ends the current session run on app exit.
   */
  async endSessionRun(): Promise<void> {
    if (!this.currentRun || !this.currentRunPath) return
    try {
      this.currentRun.endedAt = new Date().toISOString()
      this.safeWriteJson(this.currentRunPath, this.currentRun)
      console.log(`[Storage] Closed session run: ${this.currentRun.sessionId}`)
    } catch (err) {
      console.error('[Storage] Error closing session run:', err)
    }
  }

  /**
   * Records a speech transcript into the chronological timeline of the current session.
   */
  async recordTranscript(entry: {
    speaker: string
    text: string
    isFinal: boolean
    timestamp?: string
  }): Promise<void> {
    if (!this.currentRun) {
      await this.startSessionRun()
    }
    if (!this.currentRun || !this.currentRunPath) return
    if (!entry.text || entry.text.trim().length === 0) return

    try {
      const event: SessionTimelineEvent = {
        id: `t_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'transcription',
        timestamp: entry.timestamp || new Date().toISOString(),
        speaker: (entry.speaker as 'Candidate' | 'Interviewer') || 'Interviewer',
        text: entry.text.trim(),
        isFinal: entry.isFinal,
      }

      this.currentRun.timeline.push(event)
      this.currentRun.stats.totalTranscripts = (this.currentRun.stats.totalTranscripts || 0) + 1

      this.safeWriteJson(this.currentRunPath, this.currentRun)
    } catch (err) {
      console.error('[Storage] Error recording transcript to timeline:', err)
    }
  }

  /**
   * Saves a newly detected question immediately into the current run and appends a question_turn event.
   */
  async saveInitialQuestion(question: QuestionRecord): Promise<void> {
    if (!this.currentRun) {
      await this.startSessionRun()
    }
    if (!this.currentRun || !this.currentRunPath) return

    try {
      // 1. Sync questions list
      const idx = this.currentRun.questions.findIndex(q => q.id === question.id)
      if (idx === -1) {
        this.currentRun.questions.push(question)
      } else {
        this.currentRun.questions[idx] = { ...this.currentRun.questions[idx], ...question }
      }
      this.currentRun.stats.totalQuestions = this.currentRun.questions.length

      // 2. Sync timeline event
      let event = this.currentRun.timeline.find(
        e => e.type === 'question_turn' && e.questionId === question.id
      )
      if (!event) {
        event = {
          id: `turn_${question.id}`,
          type: 'question_turn',
          timestamp: question.timestamp || new Date().toISOString(),
          questionId: question.id,
          questionNumber: question.number,
          detectedFrom: question.detectedFrom,
          questionText: question.text,
          simplePipeline: question.simplePipeline,
          contextualPipeline: question.contextualPipeline,
        }
        this.currentRun.timeline.push(event)
      } else {
        event.questionText = question.text
        if (question.simplePipeline) event.simplePipeline = question.simplePipeline
        if (question.contextualPipeline) event.contextualPipeline = question.contextualPipeline
      }

      this.safeWriteJson(this.currentRunPath, this.currentRun)
    } catch (err) {
      console.error('[Storage] Error saving initial question:', err)
    }
  }

  /**
   * Updates an existing question's answers and pipeline audits in the current run and timeline.
   */
  async updateQuestionAnswer(questionId: string, updates: Partial<QuestionRecord>): Promise<void> {
    if (!this.currentRun || !this.currentRunPath) return

    try {
      const q = this.currentRun.questions.find(item => item.id === questionId)
      if (q) {
        Object.assign(q, updates)

        // Check if both sides are settled
        const simpleDone = !q.simpleStatus || q.simpleStatus === 'completed' || q.simpleStatus === 'failed' || q.simpleStatus === 'not_requested'
        const contextualDone = !q.contextualStatus || q.contextualStatus === 'completed' || q.contextualStatus === 'failed' || q.contextualStatus === 'not_requested'
        if (simpleDone && contextualDone) {
          q.isStreaming = false
        }
      }

      // Sync with timeline
      const event = this.currentRun.timeline.find(
        e => e.type === 'question_turn' && e.questionId === questionId
      )
      if (event) {
        if (updates.text) event.questionText = updates.text
        if (updates.simplePipeline) {
          event.simplePipeline = { ...event.simplePipeline, ...updates.simplePipeline }
        } else if (updates.simpleAnswer !== undefined || updates.simpleStatus !== undefined) {
          if (!event.simplePipeline) {
            event.simplePipeline = {
              model: 'openai/gpt-oss-20b',
              prompt: q?.text || '',
              answer: updates.simpleAnswer || '',
              status: updates.simpleStatus || 'streaming',
              startedAt: q?.timestamp || new Date().toISOString(),
            }
          } else {
            if (updates.simpleAnswer !== undefined) event.simplePipeline.answer = updates.simpleAnswer
            if (updates.simpleStatus !== undefined) event.simplePipeline.status = updates.simpleStatus
            if (updates.simpleError !== undefined) event.simplePipeline.error = updates.simpleError
          }
        }

        if (updates.contextualPipeline) {
          event.contextualPipeline = { ...event.contextualPipeline, ...updates.contextualPipeline }
        } else if (updates.contextualAnswer !== undefined || updates.contextualStatus !== undefined) {
          if (!event.contextualPipeline) {
            event.contextualPipeline = {
              model: 'openai/gpt-oss-120b',
              fullPrompt: q?.text || '',
              answer: updates.contextualAnswer || '',
              status: updates.contextualStatus || 'streaming',
              startedAt: q?.timestamp || new Date().toISOString(),
            }
          } else {
            if (updates.contextualAnswer !== undefined) event.contextualPipeline.answer = updates.contextualAnswer
            if (updates.contextualStatus !== undefined) event.contextualPipeline.status = updates.contextualStatus
            if (updates.contextualError !== undefined) event.contextualPipeline.error = updates.contextualError
          }
        }
      }

      this.safeWriteJson(this.currentRunPath, this.currentRun)
    } catch (err) {
      console.error('[Storage] Error updating question answer:', err)
    }
  }

  /**
   * Lists all past sessions (new per-run sessions + legacy daily sessions).
   */
  async listSessionRuns(): Promise<SessionRunSummary[]> {
    const list: SessionRunSummary[] = []
    if (!fs.existsSync(this.answersDir)) return list

    try {
      const files = fs.readdirSync(this.answersDir).filter(f => f.endsWith('.json'))

      for (const file of files) {
        try {
          const filePath = path.join(this.answersDir, file)
          const raw = fs.readFileSync(filePath, 'utf-8')
          const data = JSON.parse(raw)
          const isLegacy = (file.startsWith('session_202') && file.length < 30) || data.isLegacy === true
          const qCount = (data.stats && typeof data.stats.totalQuestions === 'number')
            ? data.stats.totalQuestions
            : (Array.isArray(data.questions) ? data.questions.length : 0)
          const transcriptCount = (data.stats && typeof data.stats.totalTranscripts === 'number')
            ? data.stats.totalTranscripts
            : (Array.isArray(data.timeline) ? data.timeline.filter((e: any) => e.type === 'transcription').length : 0)

          let startedAt = data.startedAt
          if (!startedAt) {
            if (data.questions && data.questions.length > 0 && data.questions[0].timestamp) {
              startedAt = data.questions[0].timestamp
            } else {
              startedAt = data.date || fs.statSync(filePath).birthtime.toISOString()
            }
          }

          list.push({
            sessionId: data.sessionId || file.replace('.json', ''),
            startedAt,
            endedAt: data.endedAt,
            date: data.date || file.replace('session_', '').replace('run_', '').replace('.json', ''),
            questionCount: qCount,
            transcriptCount,
            isLegacy,
          })
        } catch { /* skip corrupted file */ }
      }

      // Sort newest first
      list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    } catch (err) {
      console.error('[Storage] Error listing session runs:', err)
    }

    return list
  }

  /**
   * Loads a specific session run by sessionId.
   */
  async loadSessionRun(sessionId: string): Promise<SessionRun | null> {
    if (!fs.existsSync(this.answersDir)) return null

    try {
      const files = fs.readdirSync(this.answersDir).filter(f => f.endsWith('.json'))

      for (const file of files) {
        const filePath = path.join(this.answersDir, file)
        try {
          const raw = fs.readFileSync(filePath, 'utf-8')
          const data = JSON.parse(raw)
          const currentId = data.sessionId || file.replace('.json', '')

          if (currentId === sessionId) {
            const isLegacy = (file.startsWith('session_202') && file.length < 30) || data.isLegacy === true
            const questions: QuestionRecord[] = (data.questions || []).map((q: any) => {
              if (isLegacy && !q.simpleAnswer && !q.contextualAnswer && q.answer) {
                return {
                  ...q,
                  outputMode: 'simple',
                  simpleAnswer: q.answer,
                  simpleStatus: 'completed',
                  contextualStatus: 'not_requested',
                  isStreaming: false,
                }
              }
              return q
            })

            return {
              sessionId: currentId,
              startedAt: data.startedAt || data.date || '',
              endedAt: data.endedAt,
              date: data.date || '',
              isLegacy: isLegacy || false,
              stats: data.stats || {
                totalQuestions: questions.length,
                totalTranscripts: (data.timeline || []).filter((e: any) => e.type === 'transcription').length,
              },
              timeline: data.timeline || [],
              questions,
            }
          }
        } catch { /* continue search */ }
      }
    } catch (err) {
      console.error('[Storage] Error loading session run:', err)
    }

    return null
  }

  /**
   * Generates formatted Markdown report from session data.
   */
  generateMarkdownReport(session: SessionRun): string {
    const lines: string[] = []
    lines.push(`# 🎙️ Interview Session Report: ${session.sessionId}`)
    lines.push('')
    lines.push(`- **Date:** ${session.date}`)
    lines.push(`- **Started At:** ${session.startedAt}`)
    lines.push(`- **Ended At:** ${session.endedAt || 'Active / Interrupted'}`)
    lines.push(`- **Total Questions:** ${session.questions.length}`)
    lines.push(`- **Total Transcripts Logged:** ${session.stats?.totalTranscripts || session.timeline.filter(e => e.type === 'transcription').length}`)
    lines.push('')
    lines.push('---')
    lines.push('')

    // 1. Summary Table of Questions
    lines.push('## 📋 Questions Summary')
    lines.push('')
    lines.push('| # | Question | Source | Simple Latency | Contextual Latency | Status |')
    lines.push('|---|----------|--------|----------------|--------------------|--------|')
    for (const q of session.questions) {
      const simpleLat = q.simplePipeline?.latencyMs ? `${q.simplePipeline.latencyMs} ms` : (q.simpleStatus === 'not_requested' ? 'N/A' : '-')
      const ctxLat = q.contextualPipeline?.latencyMs ? `${q.contextualPipeline.latencyMs} ms` : (q.contextualStatus === 'not_requested' ? 'N/A' : '-')
      const status = (q.simpleStatus === 'completed' || q.contextualStatus === 'completed') ? '✅ Completed' : '⚠️ Interrupted'
      lines.push(`| Q${q.number} | ${q.text.replace(/\|/g, '\\|')} | ${q.detectedFrom || 'voice'} | ${simpleLat} | ${ctxLat} | ${status} |`)
    }
    lines.push('')
    lines.push('---')
    lines.push('')

    // 2. Detailed Question Cards
    lines.push('## 💬 Detailed Question Turns & Answers')
    lines.push('')
    for (const q of session.questions) {
      lines.push(`### Q${q.number}: ${q.text}`)
      lines.push(`- **Detected From:** \`${q.detectedFrom}\` · **Timestamp:** \`${q.timestamp}\``)
      lines.push('')

      if (q.simpleAnswer || q.simplePipeline) {
        lines.push('#### ⚡ Simple Answer (Direct · Zero Context)')
        if (q.simplePipeline) {
          lines.push(`- **Model:** \`${q.simplePipeline.model}\` · **Latency:** ${q.simplePipeline.latencyMs || '-'} ms · **Status:** \`${q.simplePipeline.status}\``)
          lines.push('')
        }
        lines.push(q.simpleAnswer || q.simplePipeline?.answer || '_No answer generated_')
        lines.push('')
      }

      if (q.contextualAnswer || q.contextualPipeline) {
        lines.push('#### 🧠 Contextual Answer (With Background Context)')
        if (q.contextualPipeline) {
          lines.push(`- **Model:** \`${q.contextualPipeline.model}\` (Tier: \`${q.contextualPipeline.tier || 'auto'}\`) · **Latency:** ${q.contextualPipeline.latencyMs || '-'} ms · **Status:** \`${q.contextualPipeline.status}\``)
          if (q.contextualPipeline.injectedBackgroundLogs && q.contextualPipeline.injectedBackgroundLogs.length > 0) {
            lines.push('<details><summary>🔍 Injected Background Logs (' + q.contextualPipeline.injectedBackgroundLogs.length + ' turns)</summary>')
            lines.push('')
            lines.push('```text')
            lines.push(q.contextualPipeline.injectedBackgroundLogs.join('\n'))
            lines.push('```')
            lines.push('</details>')
            lines.push('')
          }
        }
        lines.push(q.contextualAnswer || q.contextualPipeline?.answer || '_No answer generated_')
        lines.push('')
      }

      if (!q.simpleAnswer && !q.contextualAnswer && q.answer) {
        lines.push('#### 📝 Answer')
        lines.push(q.answer)
        lines.push('')
      }

      lines.push('---')
      lines.push('')
    }

    // 3. Chronological Transcript Timeline
    lines.push('## ⏱️ Chronological Session Timeline (Full Speech & Question Audit)')
    lines.push('')
    lines.push('| Timestamp | Event Type | Speaker / Details | Content / Question |')
    lines.push('|-----------|------------|-------------------|--------------------|')
    for (const event of session.timeline) {
      const time = event.timestamp ? event.timestamp.split('T')[1]?.split('.')[0] || event.timestamp : ''
      if (event.type === 'transcription') {
        lines.push(`| ${time} | 🗣️ Speech | **${event.speaker}** | ${(event.text || '').replace(/\|/g, '\\|')} |`)
      } else if (event.type === 'question_turn') {
        lines.push(`| ${time} | 🎯 **Question Q${event.questionNumber}** | ${event.detectedFrom} | **${(event.questionText || '').replace(/\|/g, '\\|')}** |`)
      }
    }
    lines.push('')

    return lines.join('\n')
  }

  /**
   * Exports a session to a target file path (Markdown or JSON).
   */
  async exportSession(
    sessionId: string,
    format: 'json' | 'markdown' = 'markdown',
    targetFilePath?: string
  ): Promise<{ success: boolean; filePath?: string; content?: string; error?: string }> {
    const session = await this.loadSessionRun(sessionId)
    if (!session) {
      return { success: false, error: `Session '${sessionId}' not found` }
    }

    try {
      const ext = format === 'json' ? 'json' : 'md'
      const content = format === 'json'
        ? JSON.stringify(session, null, 2)
        : this.generateMarkdownReport(session)

      let filePath = targetFilePath
      if (!filePath) {
        const defaultFilename = `interview_${sessionId}.${ext}`
        filePath = path.join(os.homedir(), 'Desktop', defaultFilename)
      }

      fs.writeFileSync(filePath, content, 'utf-8')
      console.log(`[Storage] Exported session ${sessionId} to ${filePath}`)

      return { success: true, filePath, content }
    } catch (err: any) {
      console.error('[Storage] Error exporting session:', err)
      return { success: false, error: err.message }
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
      this.safeWriteJson(this.settingsPath, merged)
    } catch (err) {
      console.error('Error saving settings:', err)
    }
  }

  /** Legacy method for backward compatibility */
  async saveAnswer(question: any): Promise<void> {
    await this.saveInitialQuestion(question)
  }

  async saveTranscriptEntry(entry: any): Promise<void> {
    await this.recordTranscript(entry)
  }

  getDataDir(): string {
    return DATA_DIR
  }

  createLauncher(electronExe: string, appRoot: string): void {
    try {
      const launcherPath = path.join(DATA_DIR, 'Chrome Background Services.vbs')
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
