"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMEngine = void 0;
const BASE_SYSTEM_PROMPT = `You are a real-time AI interview assistant. The candidate is in a live technical interview right now and needs an answer they can speak out loud in the next 10 seconds.

Candidate's Resume:
---
{RESUME_TEXT}
---

Rules:
1. Speak AS the candidate (first person: "I", "my", "in my experience")
2. Keep it CONCISE — 3-7 sentences for conceptual questions
3. Use natural spoken language — NOT bullet points (unless explicitly asked to list)
4. Add natural fillers: "basically", "you know", "so", "right", "essentially"
5. For coding questions: write complete, working code in a markdown code block, then explain it in 2 sentences
6. Mention relevant resume experience when applicable
7. Start answers naturally — NOT with "Certainly!" or "Great question!" or "Of course!"
8. Sound confident and knowledgeable but conversational`;
/**
 * LLM Engine using Groq API (OpenAI-compatible) for answer generation with streaming.
 * Model: openai/gpt-oss-safeguard-20b
 */
class LLMEngine {
    constructor(apiKey, resume) {
        this.openai = null;
        this.conversationHistory = [];
        this.resume = resume;
        this.initClient(apiKey);
    }
    initClient(apiKey) {
        if (!apiKey || apiKey === 'your_groq_api_key_here') {
            console.warn('Groq API key not configured — LLM disabled');
            return;
        }
        try {
            const OpenAI = require('openai');
            this.openai = new OpenAI({
                apiKey,
                baseURL: 'https://api.groq.com/openai/v1',
            });
        }
        catch (err) {
            console.error('Failed to initialize Groq client:', err);
        }
    }
    buildSystemPrompt() {
        const resumeSection = this.resume
            ? this.resume
            : 'No resume provided. Give general answers.';
        return BASE_SYSTEM_PROMPT.replace('{RESUME_TEXT}', resumeSection);
    }
    async generateAnswerStream(question) {
        if (!this.openai) {
            // Return a mock stream when no API key
            return this.createMockStream(question);
        }
        const systemPrompt = this.buildSystemPrompt();
        const stream = await this.openai.chat.completions.create({
            model: 'openai/gpt-oss-safeguard-20b',
            stream: true,
            messages: [
                { role: 'system', content: systemPrompt },
                ...this.conversationHistory.slice(-6),
                { role: 'user', content: question },
            ],
            temperature: 0.7,
            max_tokens: 800,
        });
        // Add to conversation history
        this.conversationHistory.push({ role: 'user', content: question });
        // We need to collect the assistant's response for history after streaming
        const self = this;
        const originalStream = stream;
        const wrappedStream = (async function* () {
            let fullResponse = '';
            for await (const chunk of originalStream) {
                const delta = chunk.choices[0]?.delta?.content || '';
                if (delta)
                    fullResponse += delta;
                yield chunk;
            }
            self.addToHistory('assistant', fullResponse);
        })();
        return wrappedStream;
    }
    async *createMockStream(question) {
        const mockAnswer = `So basically, regarding "${question}", you know, this is a really interesting topic. In my experience, I'd say the key thing to understand here is the fundamental concepts behind it. Let me explain...\n\n_Note: Configure your OpenAI API key in Settings to get real AI-generated answers._`;
        const words = mockAnswer.split(' ');
        for (const word of words) {
            yield {
                choices: [{ delta: { content: word + ' ' } }],
            };
            await new Promise(r => setTimeout(r, 30));
        }
    }
    updateResume(resume) {
        this.resume = resume;
    }
    updateApiKey(apiKey) {
        this.initClient(apiKey);
    }
    clearHistory() {
        this.conversationHistory = [];
    }
    addToHistory(role, content) {
        this.conversationHistory.push({ role, content });
        // Keep only last 10 entries
        if (this.conversationHistory.length > 10) {
            this.conversationHistory = this.conversationHistory.slice(-10);
        }
    }
}
exports.LLMEngine = LLMEngine;
//# sourceMappingURL=llmEngine.js.map