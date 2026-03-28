/**
 * Question detection from interviewer speech.
 * Uses rule-based detection + optional LLM classification.
 */
export class QuestionDetector {
  private static QUESTION_STARTERS = [
    'what', 'how', 'why', 'when', 'where', 'which', 'who',
    'can you', 'could you', 'would you', 'explain', 'tell me',
    'describe', 'write a', 'write the', 'implement', 'create',
    'design', 'build', 'code', 'solve', 'find', 'define',
    'give me', 'show me', 'demonstrate', 'compare', 'differentiate',
    'do you', 'is it', 'are there', 'have you', 'will you',
    'name', 'list', 'enumerate', 'elaborate', 'discuss',
    'so tell me', 'so explain', 'so what', 'so how', 'so why',
  ]

  isQuestion(text: string): boolean {
    if (!text || text.trim().length < 5) return false

    const lower = text.toLowerCase().trim()
    const wordCount = lower.split(/\s+/).length

    // Must have at least 3 words
    if (wordCount < 3) return false

    // Ends with question mark
    if (lower.endsWith('?')) return true

    // Starts with a question word/phrase
    const startsWithQuestion = QuestionDetector.QUESTION_STARTERS.some(
      starter => lower.startsWith(starter)
    )

    if (startsWithQuestion && wordCount >= 3) return true

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
    ]

    return questionPatterns.some(pattern => pattern.test(lower))
  }
}
