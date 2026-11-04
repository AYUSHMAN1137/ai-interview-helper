import { create } from 'zustand'
import { Question, TranscriptEntry, AnswerOutputMode, AnswerKind, SessionRun, SessionRunSummary } from '../types/question'
import type { AnswerMode } from '../../electron/modelStrategy'

interface AppState {
  // Questions
  questions: Question[]
  selectedQuestionId: string | null

  // Transcription
  transcriptEntries: TranscriptEntry[]

  // Audio controls
  isMicOn: boolean
  isSpeakerOn: boolean

  // UI State
  currentView: 'live' | 'history'
  settingsOpen: boolean
  isScanning: boolean
  isDetectingQuestions: boolean
  status: string
  scanningMessage: string

  // History State
  sessionRuns: SessionRunSummary[]
  selectedSessionId: string | null
  selectedSession: SessionRun | null
  isLoadingHistory: boolean

  // Settings
  resume: string
  openaiApiKey: string
  deepgramApiKey: string
  model: string
  answerMode: AnswerMode
  answerOutputMode: AnswerOutputMode
  opacity: number

  // Usage
  usageMinutes: number
  formattedUsage: string

  // Actions
  addQuestion: (q: Question) => void
  updateQuestionAnswer: (id: string, chunk: string, isDone: boolean, kind?: AnswerKind, error?: string) => void
  selectQuestion: (id: string) => void
  addTranscriptEntry: (entry: TranscriptEntry) => void
  setMicOn: (on: boolean) => void
  setSpeakerOn: (on: boolean) => void
  setCurrentView: (view: 'live' | 'history') => void
  openSettings: () => void
  closeSettings: () => void
  setScanning: (scanning: boolean) => void
  setDetectingQuestions: (detecting: boolean) => void
  setStatus: (status: string) => void
  setScanningMessage: (message: string) => void
  setResume: (resume: string) => void
  setOpenaiApiKey: (key: string) => void
  setDeepgramApiKey: (key: string) => void
  setModel: (model: string) => void
  setAnswerMode: (mode: AnswerMode) => void
  setAnswerOutputMode: (mode: AnswerOutputMode) => void
  setOpacity: (opacity: number) => void
  refreshSession: () => void
  updateUsage: (usedMinutes: number, formatted: string) => void

  // History actions
  loadSessionRuns: () => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  questions: [],
  selectedQuestionId: null,
  transcriptEntries: [],
  isMicOn: false,
  isSpeakerOn: false,
  currentView: 'live',
  settingsOpen: false,
  isScanning: false,
  isDetectingQuestions: false,
  status: 'Ready',
  scanningMessage: '',

  sessionRuns: [],
  selectedSessionId: null,
  selectedSession: null,
  isLoadingHistory: false,

  resume: '',
  openaiApiKey: '',
  deepgramApiKey: '',
  model: 'openai/gpt-oss-120b',
  answerMode: 'auto',
  answerOutputMode: 'both',
  opacity: 0.88,
  usageMinutes: 0,
  formattedUsage: '0h 0m',

  // Actions
  addQuestion: (q) =>
    set((state) => {
      const mode = q.outputMode || state.answerOutputMode || 'both'
      const existingIndex = state.questions.findIndex((item) => item.id === q.id)
      if (existingIndex !== -1) {
        const updated = [...state.questions]
        updated[existingIndex] = {
          ...updated[existingIndex],
          text: q.text,
          outputMode: mode,
        }
        return { questions: updated, selectedQuestionId: q.id }
      }

      const populatedQ: Question = {
        ...q,
        outputMode: mode,
        simpleAnswer: q.simpleAnswer ?? '',
        simpleStatus: q.simpleStatus ?? (mode === 'contextual' ? 'not_requested' : 'streaming'),
        contextualAnswer: q.contextualAnswer ?? '',
        contextualStatus: q.contextualStatus ?? (mode === 'simple' ? 'not_requested' : 'streaming'),
        answer: q.answer ?? '',
        isStreaming: q.isStreaming ?? true,
      }
      return {
        questions: [populatedQ, ...state.questions],
        selectedQuestionId: populatedQ.id,
      }
    }),

  updateQuestionAnswer: (id, chunk, isDone, kind = 'contextual', error) =>
    set((state) => ({
      questions: state.questions.map((q) => {
        if (q.id !== id) return q

        if (kind === 'simple') {
          const newSimple = (q.simpleAnswer || '') + chunk
          const newStatus = error ? 'failed' : (isDone ? 'completed' : 'streaming')
          const isStillStreaming = (!isDone && newStatus === 'streaming') || (q.contextualStatus === 'streaming')
          return {
            ...q,
            simpleAnswer: newSimple,
            simpleStatus: newStatus,
            simpleError: error || q.simpleError,
            isStreaming: isStillStreaming,
            ...(q.outputMode === 'simple' ? { answer: newSimple } : {})
          }
        } else if (kind === 'contextual') {
          const newContextual = (q.contextualAnswer || '') + chunk
          const newStatus = error ? 'failed' : (isDone ? 'completed' : 'streaming')
          const isStillStreaming = (!isDone && newStatus === 'streaming') || (q.simpleStatus === 'streaming')
          return {
            ...q,
            contextualAnswer: newContextual,
            contextualStatus: newStatus,
            contextualError: error || q.contextualError,
            answer: newContextual,
            isStreaming: isStillStreaming,
          }
        } else {
          // Legacy
          return {
            ...q,
            answer: (q.answer || '') + chunk,
            isStreaming: !isDone,
          }
        }
      }),
    })),

  selectQuestion: (id) => set({ selectedQuestionId: id }),

  addTranscriptEntry: (entry) =>
    set((state) => {
      const list = state.transcriptEntries
      if (list.length === 0) {
        return { transcriptEntries: [entry] }
      }
      const last = list[list.length - 1]

      // If the last entry was interim from same speaker, update in-place
      if (!last.isFinal && last.speaker === entry.speaker) {
        const updated = [...list]
        updated[updated.length - 1] = entry
        return { transcriptEntries: updated }
      }

      // If exact duplicate of last entry from same speaker, skip
      if (
        last.speaker === entry.speaker &&
        last.text.trim().toLowerCase() === entry.text.trim().toLowerCase()
      ) {
        return state
      }

      // Cap at 100 entries max to prevent memory bloat
      const capped = list.length >= 100 ? list.slice(-99) : list
      return { transcriptEntries: [...capped, entry] }
    }),

  setMicOn: (on) => set({ isMicOn: on }),
  setSpeakerOn: (on) => set({ isSpeakerOn: on }),
  setCurrentView: (view) => set({ currentView: view }),

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  setScanning: (scanning) => set({ isScanning: scanning }),
  setDetectingQuestions: (detecting) => set({ isDetectingQuestions: detecting }),
  setStatus: (status) => set({ status }),
  setScanningMessage: (message) => set({ scanningMessage: message }),

  setResume: (resume) => set({ resume }),
  setOpenaiApiKey: (key) => set({ openaiApiKey: key }),
  setDeepgramApiKey: (key) => set({ deepgramApiKey: key }),
  setModel: (model) => set({ model }),
  setAnswerMode: (mode) => set({ answerMode: mode }),
  setAnswerOutputMode: (mode) => {
    set({ answerOutputMode: mode })
    if (window.electronAPI?.setAnswerOutputMode) {
      window.electronAPI.setAnswerOutputMode(mode).catch(() => {})
    }
  },
  setOpacity: (opacity) => set({ opacity }),

  refreshSession: () =>
    set({
      questions: [],
      selectedQuestionId: null,
      transcriptEntries: [],
      status: 'Ready',
      isScanning: false,
      isDetectingQuestions: false,
      scanningMessage: '',
    }),

  updateUsage: (usedMinutes, formatted) =>
    set({ usageMinutes: usedMinutes, formattedUsage: formatted }),

  loadSessionRuns: async () => {
    if (!window.electronAPI?.listSessionRuns) return
    set({ isLoadingHistory: true })
    try {
      const runs = await window.electronAPI.listSessionRuns()
      set({ sessionRuns: runs || [], isLoadingHistory: false })
      // Auto-select the first run if available and none selected
      if (runs && runs.length > 0 && !get().selectedSessionId) {
        get().selectSession(runs[0].sessionId)
      }
    } catch (err) {
      console.error('Failed to load session runs:', err)
      set({ isLoadingHistory: false })
    }
  },

  selectSession: async (sessionId: string) => {
    if (!window.electronAPI?.loadSessionRun) return
    set({ selectedSessionId: sessionId, isLoadingHistory: true })
    try {
      const data = await window.electronAPI.loadSessionRun(sessionId)
      set({ selectedSession: data, isLoadingHistory: false })
    } catch (err) {
      console.error('Failed to load session:', err)
      set({ isLoadingHistory: false })
    }
  },
}))
