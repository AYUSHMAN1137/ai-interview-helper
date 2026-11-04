import { create } from 'zustand'
import { Question, TranscriptEntry } from '../types/question'
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
  settingsOpen: boolean
  isScanning: boolean
  isDetectingQuestions: boolean
  status: string
  scanningMessage: string

  // Settings
  resume: string
  openaiApiKey: string
  deepgramApiKey: string
  model: string
  answerMode: AnswerMode
  opacity: number

  // Usage
  usageMinutes: number
  formattedUsage: string

  // Actions
  addQuestion: (q: Question) => void
  updateQuestionAnswer: (id: string, chunk: string, isDone: boolean) => void
  selectQuestion: (id: string) => void
  addTranscriptEntry: (entry: TranscriptEntry) => void
  setMicOn: (on: boolean) => void
  setSpeakerOn: (on: boolean) => void
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
  setOpacity: (opacity: number) => void
  refreshSession: () => void
  updateUsage: (usedMinutes: number, formatted: string) => void
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  questions: [],
  selectedQuestionId: null,
  transcriptEntries: [],
  isMicOn: false,
  isSpeakerOn: false,
  settingsOpen: false,
  isScanning: false,
  isDetectingQuestions: false,
  status: 'Ready',
  scanningMessage: '',
  resume: '',
  openaiApiKey: '',
  deepgramApiKey: '',
  model: 'openai/gpt-oss-120b',
  answerMode: 'auto',
  opacity: 0.88,
  usageMinutes: 0,
  formattedUsage: '0h 0m',

  // Actions
  addQuestion: (q) =>
    set((state) => ({
      questions: [q, ...state.questions], // Newest at top
      selectedQuestionId: q.id, // Auto-select newest
    })),

  updateQuestionAnswer: (id, chunk, isDone) =>
    set((state) => ({
      questions: state.questions.map((q) =>
        q.id === id
          ? { ...q, answer: q.answer + chunk, isStreaming: !isDone }
          : q
      ),
    })),

  selectQuestion: (id) => set({ selectedQuestionId: id }),

  addTranscriptEntry: (entry) =>
    set((state) => ({
      transcriptEntries: [...state.transcriptEntries, entry],
    })),

  setMicOn: (on) => set({ isMicOn: on }),
  setSpeakerOn: (on) => set({ isSpeakerOn: on }),

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
}))
