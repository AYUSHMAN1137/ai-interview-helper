/**
 * Question detection and transcript log buffering from speech.
 * Handles:
 * 1. Rule-based detection of questions (starters, mid-sentence patterns, question marks).
 * 2. Rolling log buffering (last 25 logs) to recover questions broken across speech chunks.
 * 3. Overlap-free utterance reconstruction.
 * 4. Fast local question deduplication (growing superset matching, Jaccard overlap).
 */

export interface TranscriptItem {
  id: string
  speaker: 'Candidate' | 'Interviewer'
  text: string
  timestamp: number
  isFinal: boolean
}

export interface DedupeResult {
  isDuplicate: boolean
  isSuperset?: boolean
  targetQuestionId?: string
}

export class QuestionDetector {
  private static QUESTION_STARTERS = [
    'what', 'how', 'why', 'when', 'where', 'which', 'who',
    'can you', 'could you', 'would you', 'explain', 'tell me',
    'tell me more', 'tell me about', 'elaborate', 'can you elaborate',
    'could you elaborate', 'explain more', 'go on', 'continue',
    'what about', 'how about', 'walk me through',
    'describe', 'write a', 'write the', 'implement', 'create',
    'design', 'build', 'code', 'solve', 'find', 'define',
    'give me', 'show me', 'demonstrate', 'compare', 'differentiate',
    'do you', 'is it', 'are there', 'have you', 'will you',
    'name', 'list', 'enumerate', 'discuss',
    'so tell me', 'so explain', 'so what', 'so how', 'so why',
  ]

  isQuestion(text: string): boolean {
    if (!text || text.trim().length < 4) return false

    const lower = text.toLowerCase().trim()
    const wordCount = lower.split(/\s+/).length

    // Must have at least 2 words (e.g. "Tell more", "Go on", "Why that?")
    if (wordCount < 2) return false

    // Ends with question mark
    if (lower.endsWith('?')) return true

    // Starts with a question word/phrase
    const startsWithQuestion = QuestionDetector.QUESTION_STARTERS.some(
      starter => lower.startsWith(starter)
    )

    if (startsWithQuestion && wordCount >= 2) return true

    // Contains question patterns mid-sentence
    const questionPatterns = [
      /\bwhat is\b/i,
      /\bhow do\b/i,
      /\bhow does\b/i,
      /\bcan you\b/i,
      /\bcould you\b/i,
      /\btell me about\b/i,
      /\bexplain (?:the|how|what|why)\b/i,
      /\bwrite (?:a|an|the|me)\b/i,
      /\bdifference between\b/i,
      /\bhow would you\b/i,
      /\bwhy would you\b/i,
    ]

    return questionPatterns.some(pattern => pattern.test(lower))
  }

  /**
   * Extract the question portion from a longer multi-sentence utterance.
   */
  extractQuestion(text: string): string | null {
    if (!text || text.trim().length < 5) return null
    const trimmed = text.trim()

    // If the entire text is recognized as a question
    if (this.isQuestion(trimmed)) {
      // If multi-sentence ("That was good. Can you explain..."), isolate from where the question starts
      const sentences = trimmed.split(/(?<=[.?!])\s+/)
      for (let i = 0; i < sentences.length; i++) {
        const candidate = sentences.slice(i).join(' ').trim()
        if (this.isQuestion(candidate)) {
          return candidate
        }
      }
      return trimmed
    }

    // Check sentence by sentence from the end
    const sentences = trimmed.split(/(?<=[.?!])\s+/)
    for (let i = sentences.length - 1; i >= 0; i--) {
      const candidate = sentences.slice(i).join(' ').trim()
      if (this.isQuestion(candidate)) {
        return candidate
      }
    }

    return null
  }
}

/**
 * Rolling buffer for recent 15-25 transcription logs.
 * Reconstructs continuous thoughts across fragmented chunks while
 * eliminating duplicate and stuttering word overlaps.
 */
export class TranscriptLogBuffer {
  private logs: TranscriptItem[] = []
  private maxLogs: number

  constructor(maxLogs: number = 25) {
    this.maxLogs = maxLogs
  }

  add(item: TranscriptItem) {
    // If not final and last item is from same speaker, update in-place
    if (!item.isFinal && this.logs.length > 0) {
      const last = this.logs[this.logs.length - 1]
      if (!last.isFinal && last.speaker === item.speaker) {
        this.logs[this.logs.length - 1] = item
        return
      }
    }

    this.logs.push(item)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
  }

  getRecentLogs(count: number = 25): TranscriptItem[] {
    return this.logs.slice(-count)
  }

  clear() {
    this.logs = []
  }

  /**
   * Stitches the last N logs from a speaker into a coherent utterance,
   * eliminating stuttered word overlaps between consecutive chunks.
   */
  getReconstructedUtterance(speaker: 'Interviewer' | 'Candidate' = 'Interviewer', lookbackCount: number = 15): string {
    const speakerLogs = this.logs
      .filter(l => l.speaker === speaker && l.text.trim().length > 0)
      .slice(-lookbackCount)

    if (speakerLogs.length === 0) return ''

    let result = speakerLogs[0].text.trim()

    for (let i = 1; i < speakerLogs.length; i++) {
      const next = speakerLogs[i].text.trim()
      if (!next) continue

      // If next already contains result, take next
      if (next.toLowerCase().startsWith(result.toLowerCase())) {
        result = next
        continue
      }

      // Check word-level overlap
      const wordsResult = result.split(/\s+/)
      const wordsNext = next.split(/\s+/)
      let overlapCount = 0
      const maxCheck = Math.min(wordsResult.length, wordsNext.length, 6)

      for (let len = maxCheck; len >= 1; len--) {
        const tail = wordsResult.slice(-len).join(' ').toLowerCase()
        const head = wordsNext.slice(0, len).join(' ').toLowerCase()
        if (tail === head) {
          overlapCount = len
          break
        }
      }

      if (overlapCount > 0) {
        result = wordsResult.concat(wordsNext.slice(overlapCount)).join(' ')
      } else {
        result = `${result} ${next}`
      }
    }

    return result
  }
}

/**
 * Fast synchronous deduplication for live interview questions.
 * Handles:
 * - Exact matches within 30s
 * - Growing partial / superset upgrades within 8s
 * - Token Jaccard similarity (>0.70)
 */
export class QuestionDeduper {
  private recentQuestions: { id: string; text: string; timestamp: number }[] = []

  recordQuestion(id: string, text: string) {
    this.recentQuestions.push({ id, text, timestamp: Date.now() })
    const cutoff = Date.now() - 45000
    this.recentQuestions = this.recentQuestions.filter(q => q.timestamp > cutoff).slice(-10)
  }

  updateQuestion(id: string, newText: string) {
    const item = this.recentQuestions.find(q => q.id === id)
    if (item) {
      item.text = newText
      item.timestamp = Date.now()
    }
  }

  clear() {
    this.recentQuestions = []
  }

  check(text: string): DedupeResult {
    const normNew = this.normalize(text)
    if (!normNew || normNew.length < 5) return { isDuplicate: true }

    const now = Date.now()
    const tokensNew = new Set(normNew.split(/\s+/).filter(w => w.length > 2))

    for (const recent of [...this.recentQuestions].reverse()) {
      const age = now - recent.timestamp
      if (age > 30000) continue

      const normRecent = this.normalize(recent.text)

      // Exact normalized match
      if (normNew === normRecent) {
        return { isDuplicate: true }
      }

      // Superset check (growing partial within 8s)
      if (age < 8000 && normNew.startsWith(normRecent) && normNew.length > normRecent.length) {
        return { isDuplicate: true, isSuperset: true, targetQuestionId: recent.id }
      }

      // Jaccard similarity for overlap check
      const tokensRecent = new Set(normRecent.split(/\s+/).filter(w => w.length > 2))
      if (tokensNew.size > 0 && tokensRecent.size > 0) {
        let intersection = 0
        for (const t of tokensNew) {
          if (tokensRecent.has(t)) intersection++
        }
        const union = new Set([...tokensNew, ...tokensRecent]).size
        const similarity = intersection / union

        if (similarity >= 0.70) {
          if (age < 8000 && normNew.length > normRecent.length + 8) {
            return { isDuplicate: true, isSuperset: true, targetQuestionId: recent.id }
          }
          return { isDuplicate: true }
        }
      }
    }

    return { isDuplicate: false }
  }

  private normalize(text: string): string {
    return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
  }
}
