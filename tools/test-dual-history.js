const fs = require('fs')
const path = require('path')
const os = require('os')
const assert = require('assert')

// Test storage manager using a temp dir
const tmpDir = path.join(os.tmpdir(), `ai_test_${Date.now()}`)
fs.mkdirSync(tmpDir, { recursive: true })

const answersDir = path.join(tmpDir, 'answers')
fs.mkdirSync(answersDir, { recursive: true })

// 1. Create a mock legacy file to test backward compatibility
const legacyFile = path.join(answersDir, 'session_2026-10-31.json')
fs.writeFileSync(legacyFile, JSON.stringify({
  sessionId: 'sess_2026-10-31',
  date: '2026-10-31',
  questions: [
    {
      id: 'q_legacy_1',
      number: 1,
      text: 'What is database sharding?',
      answer: 'Database sharding splits data horizontally across servers.',
      isStreaming: false,
      detectedFrom: 'voice',
      timestamp: '2026-10-31T07:24:41.045Z'
    }
  ]
}, null, 2))

// Test StorageManager class from dist-electron
const { StorageManager } = require('../dist-electron/storageManager')

// Override answersDir on instance for testing
const sm = new StorageManager()
sm.answersDir = answersDir

async function run() {
  console.log('--- Test 1: listSessionRuns with legacy file ---')
  const runs1 = await sm.listSessionRuns()
  assert(runs1.length === 1, `Expected 1 run, got ${runs1.length}`)
  assert.strictEqual(runs1[0].sessionId, 'sess_2026-10-31')
  assert.strictEqual(runs1[0].isLegacy, true)
  assert.strictEqual(runs1[0].questionCount, 1)
  console.log('✓ Legacy session listed accurately')

  console.log('--- Test 2: startSessionRun ---')
  const run1 = await sm.startSessionRun()
  assert(run1.sessionId.startsWith('session_') || run1.sessionId.startsWith('run_'), 'sessionId should start with session_ or run_')
  assert.strictEqual(run1.questions.length, 0)
  console.log(`✓ Started session run: ${run1.sessionId}`)

  console.log('--- Test 3: saveInitialQuestion & updateQuestionAnswer (Dual) ---')
  const q1 = {
    id: 'q_test_1',
    number: 1,
    text: 'What is event loop?',
    detectedFrom: 'voice',
    timestamp: new Date().toISOString(),
    outputMode: 'both',
    simpleAnswer: '',
    simpleStatus: 'streaming',
    contextualAnswer: '',
    contextualStatus: 'streaming',
    answer: '',
    isStreaming: true,
  }
  await sm.saveInitialQuestion(q1)

  // Update simple answer
  await sm.updateQuestionAnswer('q_test_1', {
    simpleAnswer: 'The event loop processes non-blocking I/O callbacks in Node.',
    simpleStatus: 'completed'
  })

  // Update contextual answer
  await sm.updateQuestionAnswer('q_test_1', {
    contextualAnswer: 'In Node.js, the event loop coordinates timers, I/O, and microtasks.',
    contextualStatus: 'completed',
    answer: 'In Node.js, the event loop coordinates timers, I/O, and microtasks.'
  })

  const loaded = await sm.loadSessionRun(run1.sessionId)
  assert(loaded !== null, 'Loaded session must not be null')
  assert.strictEqual(loaded.questions.length, 1)
  assert.strictEqual(loaded.questions[0].simpleAnswer, 'The event loop processes non-blocking I/O callbacks in Node.')
  assert.strictEqual(loaded.questions[0].contextualAnswer, 'In Node.js, the event loop coordinates timers, I/O, and microtasks.')
  assert.strictEqual(loaded.questions[0].isStreaming, false)
  console.log('✓ Dual answers saved and verified')

  console.log('--- Test 4: load legacy session normalization ---')
  const loadedLegacy = await sm.loadSessionRun('sess_2026-10-31')
  assert(loadedLegacy !== null)
  assert.strictEqual(loadedLegacy.isLegacy, true)
  assert.strictEqual(loadedLegacy.questions[0].simpleAnswer, 'Database sharding splits data horizontally across servers.')
  assert.strictEqual(loadedLegacy.questions[0].outputMode, 'simple')
  console.log('✓ Legacy session normalized cleanly on load without modifying original file')

  console.log('--- Test 5: LLMEngine Dual Streams & History ---')
  const { LLMEngine } = require('../dist-electron/llmEngine')
  const llm = new LLMEngine('', 'Senior Full Stack Engineer resume')

  // Test simple stream (no history)
  const simpleStream = await llm.generateSimpleAnswerStream('Explain REST')
  let simpleText = ''
  for await (const chunk of simpleStream) {
    simpleText += chunk.choices[0]?.delta?.content || ''
  }
  assert(simpleText.includes('Explain REST'), 'Simple stream should generate mock answer')
  assert(simpleText.startsWith('[Simple Direct Answer]'), 'Simple stream should be tagged as simple')
  console.log(`✓ Simple stream: ${simpleText.substring(0, 40)}...`)

  // Test contextual stream (uses history)
  const ctxStream1 = await llm.generateContextualAnswerStream('What is Docker?')
  let ctxText1 = ''
  for await (const chunk of ctxStream1) {
    ctxText1 += chunk.choices[0]?.delta?.content || ''
  }
  assert(ctxText1.startsWith('[Contextual Answer]'), 'Contextual stream should be tagged as contextual')
  assert(llm.contextualHistory.length === 2, `Expected 2 messages in contextual history, got ${llm.contextualHistory.length}`)
  console.log('✓ Contextual turn 1 recorded in history')

  // Second contextual question
  const ctxStream2 = await llm.generateContextualAnswerStream('How does it compare to VMs?')
  let ctxText2 = ''
  for await (const chunk of ctxStream2) {
    ctxText2 += chunk.choices[0]?.delta?.content || ''
  }
  assert(llm.contextualHistory.length === 4, `Expected 4 messages in contextual history, got ${llm.contextualHistory.length}`)
  console.log('✓ Contextual turn 2 recorded in history (last 4 messages preserved)')

  llm.clearHistory()
  assert.strictEqual(llm.contextualHistory.length, 0, 'Contextual history must be cleared')
  console.log('✓ History reset verified')

  console.log('--- Test 6: TranscriptLogBuffer & QuestionDeduper ---')
  const { QuestionDetector, TranscriptLogBuffer, QuestionDeduper } = require('../dist-electron/questionDetector')
  const qd = new QuestionDetector()
  const buf = new TranscriptLogBuffer(25)
  const deduper = new QuestionDeduper()

  // Broken chunks simulation: interviewer speaking across 3 logs
  buf.add({ id: '1', speaker: 'Interviewer', text: 'Can you please explain', timestamp: Date.now(), isFinal: true })
  buf.add({ id: '2', speaker: 'Interviewer', text: 'how indexing works in MongoDB', timestamp: Date.now(), isFinal: true })
  buf.add({ id: '3', speaker: 'Interviewer', text: 'and when to avoid compound indexes?', timestamp: Date.now(), isFinal: true })

  const reconstructed = buf.getReconstructedUtterance('Interviewer', 15)
  assert.strictEqual(
    reconstructed,
    'Can you please explain how indexing works in MongoDB and when to avoid compound indexes?'
  )
  console.log('✓ Reconstructed multi-chunk utterance accurately without duplicate words')

  const extracted = qd.extractQuestion(reconstructed)
  assert(extracted !== null, 'Extracted question should not be null')
  assert(extracted.includes('how indexing works in MongoDB'), 'Extracted question should include full question text')
  console.log('✓ Extracted complete question from multi-log utterance')

  // Deduplication check: growing superset
  deduper.recordQuestion('q_1', 'Can you please explain')
  const dedupe1 = deduper.check('Can you please explain how indexing works in MongoDB')
  assert(dedupe1.isDuplicate === true, 'Superset should be marked as duplicate/upgrade')
  assert(dedupe1.isSuperset === true, 'Superset should be marked as isSuperset')
  assert.strictEqual(dedupe1.targetQuestionId, 'q_1')
  console.log('✓ Detected growing superset question upgrade')

  // Exact duplicate check
  const dedupe2 = deduper.check('can you please explain')
  assert(dedupe2.isDuplicate === true && !dedupe2.isSuperset, 'Exact duplicate should be dropped')
  console.log('✓ Exact duplicate successfully suppressed')

  // Short follow-up question recognition check
  assert.strictEqual(qd.isQuestion('Tell me more.'), true, '"Tell me more." should be recognized as question')
  assert.strictEqual(qd.isQuestion('Can you elaborate?'), true, '"Can you elaborate?" should be recognized as question')
  assert.strictEqual(qd.isQuestion('Why that?'), true, '"Why that?" should be recognized as question')
  console.log('✓ Follow-up questions (Tell me more / Can you elaborate) recognized')

  // Contextual answer with recent transcript logs
  const ctxStream3 = await llm.generateContextualAnswerStream('Tell me more', {
    recentTranscriptLogs: '[Interviewer]: Tell me about ML\n[Candidate]: I built recommendation engines.'
  })
  let ctxText3 = ''
  for await (const chunk of ctxStream3) {
    ctxText3 += chunk.choices[0]?.delta?.content || ''
  }
  assert(ctxText3.includes('Tell me more'), 'Contextual stream with logs generated successfully')
  console.log('✓ Contextual stream with recent transcript logs executed cleanly')

  console.log('\n========================================')
  console.log('ALL VERIFICATION SMOKE TESTS PASSED! ✓')
  console.log('========================================')
}

run().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
}).finally(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
})

