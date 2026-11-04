import { desktopCapturer, screen } from 'electron'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { getModelId } from './modelStrategy'

const QUESTION_EXTRACTION_PROMPT = `You are analyzing text from a screen capture during an interview or coding session.

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

/** Prompt for direct vision extraction from the screenshot image */
const VISION_EXTRACTION_PROMPT = `Look at this screenshot taken during a live technical interview or coding session.

Your task: find the interview question or coding problem visible on screen.

Rules:
- Extract ONLY the question/problem statement, cleaned up
- Ignore UI chrome: buttons, menus, tabs, toolbars, status bars, timestamps, file explorers
- If it is a coding problem (e.g. "reverse a linked list", "write a function to..."), include the key constraints and examples
- Do NOT solve it, do NOT explain — just return the question text
- If there is genuinely NO question or task visible, respond with exactly: NONE`

/** Groq vision model used for direct image → question extraction */
const VISION_MODEL = 'qwen/qwen3.8-27b'

/**
 * Screenshot pipeline:
 *   1. desktopCapturer grabs the screen (WDA_EXCLUDEFROMCAPTURE hides our overlay)
 *   2. Image is resized (max 1600px) for fast upload + few tokens
 *   3. Vision-first extraction: Groq vision model reads the image directly (~500ms)
 *   4. Fallback 1: Tesseract OCR + text LLM extraction (original slow path)
 *   5. Fallback 2: rule-based extraction (no API needed)
 */
export class ScreenshotService {
  private openaiKey: string
  private model: string

  constructor(openaiKey: string, model: string = getModelId('instant')) {
    this.openaiKey = openaiKey
    this.model = model || getModelId('instant')
  }

  /**
   * Capture the primary display and return the (resized) PNG buffer.
   * Renamed responsibility: capture only — no OCR here anymore.
   */
  async captureScreen(): Promise<{ buffer: Buffer; originalSize: number }> {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    })

    if (!sources || sources.length === 0) {
      throw new Error('No screen sources found')
    }

    const primarySource = sources[0]
    const pngBuffer = primarySource.thumbnail.toPNG()

    if (!pngBuffer || pngBuffer.length < 100) {
      throw new Error('desktopCapturer returned empty image')
    }

    console.log(`Screenshot captured via desktopCapturer (${pngBuffer.length} bytes)`)

    // Resize for vision upload — full 4K screenshots waste tokens and upload time
    const sharp = require('sharp')
    const resized = await sharp(pngBuffer)
      .resize({ width: Math.min(width, 1600), withoutEnlargement: true })
      .png()
      .toBuffer()

    console.log(`Resized for vision: ${pngBuffer.length} → ${resized.length} bytes`)
    return { buffer: resized, originalSize: pngBuffer.length }
  }

  /**
   * Legacy helper kept for compatibility: capture + run OCR text extraction.
   * Only used as a fallback when vision extraction fails.
   */
  async captureAndOCR(): Promise<string> {
    const { buffer } = await this.captureScreen()

    const sharp = require('sharp')
    const processedBuffer = await sharp(buffer)
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer()

    const Tesseract = require('tesseract.js')
    const { data: { text } } = await Tesseract.recognize(processedBuffer, 'eng', {
      logger: () => {},
    })

    const trimmed = text.trim()
    console.log(`OCR result (${trimmed.length} chars):`, trimmed.substring(0, 150))
    return trimmed
  }

  /**
   * Extract question directly from the screenshot image via Groq vision.
   * Returns null if no question found or on failure (caller decides fallback).
   */
  async extractQuestionFromImage(imageBuffer: Buffer): Promise<string | null> {
    if (!this.openaiKey || this.openaiKey === 'your_groq_api_key_here') return null

    try {
      const OpenAI = require('openai')
      const openai = new OpenAI({
        apiKey: this.openaiKey,
        baseURL: 'https://api.groq.com/openai/v1',
        timeout: 15000,
      })

      const base64 = imageBuffer.toString('base64')
      const dataUrl = `data:image/png;base64,${base64}`

      const response = await openai.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_EXTRACTION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 400,
        temperature: 0,
      })

      const result = response.choices[0]?.message?.content?.trim()
      console.log('Vision extraction result:', result ? result.substring(0, 120) : '(empty)')

      if (!result || result === 'NONE') return null
      return result
    } catch (err: any) {
      console.error('Vision extraction error:', err.message || err)
      return null
    }
  }

  /**
   * Full pipeline with fallbacks:
   *   vision → OCR + text LLM → rule-based
   */
  async extractQuestionWithFallbacks(imageBuffer: Buffer): Promise<string | null> {
    // 1. Vision (fast path, ~500ms)
    const visionResult = await this.extractQuestionFromImage(imageBuffer)
    if (visionResult) return visionResult

    // 2. OCR + text extraction (slow path, only if vision unavailable/failed)
    try {
      console.log('Vision extraction unavailable — falling back to OCR path')
      const ocrText = await this.captureAndOCR()
      const extracted = await this.extractQuestion(ocrText)
      if (extracted) return extracted
    } catch (err: any) {
      console.error('OCR fallback error:', err.message || err)
    }

    // 3. Rule-based on whatever OCR text we may have (last resort)
    return null
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
