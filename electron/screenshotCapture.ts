import { desktopCapturer, screen } from 'electron'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const QUESTION_EXTRACTION_PROMPT = `You are analyzing OCR text from a screen capture during an interview or coding session.

Your task: Find the interview/coding question in this text.

Rules:
- Look for questions, tasks, or problems that need answering or solving
- Questions may be incomplete or lack a "?" mark — still extract them (e.g., "what is machine learning" is a question)
- Ignore UI elements: buttons, file names, menu items, status bars, timestamps
- If you find a question, return ONLY the question text, cleaned up
- If you find a coding problem/task (e.g., "write a function to...", "implement..."), return it
- If there is genuinely NO interview question or coding task, respond with exactly: NONE

OCR Text:
---
{OCR_TEXT}
---

Respond with ONLY the extracted question/task, nothing else. Do not add "?" if not present. Do not explain.`

/**
 * Screenshot + OCR pipeline.
 * Uses Electron's desktopCapturer (WinRT/DirectX) — respects WDA_EXCLUDEFROMCAPTURE,
 * so the overlay is automatically invisible. No window hiding needed.
 * This is near-instant (no subprocess overhead).
 */
export class ScreenshotService {
  private openaiKey: string
  private model: string

  constructor(openaiKey: string, model: string = 'openai/gpt-oss-120b') {
    this.openaiKey = openaiKey
    this.model = model || 'openai/gpt-oss-120b'
  }

  async captureAndOCR(): Promise<string> {
    // Use Electron desktopCapturer — uses WinRT which automatically excludes
    // windows with WDA_EXCLUDEFROMCAPTURE. No hide/show cycle needed.
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    })

    if (!sources || sources.length === 0) {
      throw new Error('No screen sources found')
    }

    // Use first screen source (primary display)
    const primarySource = sources[0]
    const pngBuffer = primarySource.thumbnail.toPNG()

    if (!pngBuffer || pngBuffer.length < 100) {
      throw new Error('desktopCapturer returned empty image')
    }

    console.log(`Screenshot captured via desktopCapturer (${pngBuffer.length} bytes)`)

    // Preprocess with sharp (grayscale + normalize improves OCR accuracy)
    const sharp = require('sharp')
    const processedBuffer = await sharp(pngBuffer)
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer()

    // OCR with Tesseract.js
    const Tesseract = require('tesseract.js')
    const { data: { text } } = await Tesseract.recognize(processedBuffer, 'eng', {
      logger: () => {}, // suppress verbose output
    })

    const trimmed = text.trim()
    console.log(`OCR result (${trimmed.length} chars):`, trimmed.substring(0, 150))
    return trimmed
  }

  async extractQuestion(ocrText: string): Promise<string | null> {
    if (!ocrText || ocrText.length < 3) return null

    // Rule-based fallback (always available, no API needed)
    const ruleBasedResult = this.ruleBasedExtract(ocrText)

    if (!this.openaiKey || this.openaiKey === 'your_groq_api_key_here') {
      return ruleBasedResult
    }

    try {
      const OpenAI = require('openai')
      const openai = new OpenAI({
        apiKey: this.openaiKey,
        baseURL: 'https://api.groq.com/openai/v1',
        timeout: 15000,
      })

      const truncatedOcr = ocrText.length > 2000 ? ocrText.substring(0, 2000) + '...' : ocrText

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: [{
          role: 'user',
          content: QUESTION_EXTRACTION_PROMPT.replace('{OCR_TEXT}', truncatedOcr),
        }],
        max_tokens: 200,
        temperature: 0,
      })

      const result = response.choices[0]?.message?.content?.trim()
      console.log('Groq extraction result:', result)

      if (!result || result === 'NONE') {
        return ruleBasedResult
      }
      return result
    } catch (err: any) {
      console.error('Question extraction (Groq) error:', err.message || err)
      return ruleBasedResult
    }
  }

  /**
   * Rule-based question extraction without API.
   */
  private ruleBasedExtract(ocrText: string): string | null {
    const lines = ocrText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length >= 4 && l.split(' ').length >= 2)

    const withQuestionMark = lines.find(l => l.endsWith('?'))
    if (withQuestionMark) return withQuestionMark

    const questionWords = ['what', 'how', 'why', 'when', 'where', 'which', 'who',
      'explain', 'describe', 'implement', 'write', 'create', 'design', 'find',
      'can you', 'could you', 'tell me', 'give me', 'list', 'define']
    for (const line of lines) {
      const lower = line.toLowerCase()
      if (questionWords.some(qw => lower.startsWith(qw))) {
        return line
      }
    }

    const contentLine = lines.find(l => l.length > 10 && !/^[\d\W]+$/.test(l))
    return contentLine || null
  }

  updateApiKey(key: string): void {
    this.openaiKey = key
  }

  updateModel(model: string): void {
    if (model) {
      this.model = model
    }
  }
}
