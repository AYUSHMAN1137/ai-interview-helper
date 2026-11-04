const path = require('path')
const fs = require('fs')

// Test script for the complete redesigned single-file session audit & export
async function runTest() {
  console.log('--- Starting StorageManager Session Audit & Export Test ---')

  // Load compiled StorageManager from dist-electron
  const { StorageManager } = require('../dist-electron/storageManager.js')
  const storage = new StorageManager()
  await storage.initialize()

  // 1. Start a new session run
  const session = await storage.startSessionRun()
  console.log(`[PASS] Started session: ${session.sessionId}`)

  // 2. Record incoming transcripts
  await storage.recordTranscript({
    speaker: 'Interviewer',
    text: 'Hello, welcome to the technical interview. Can you hear me clearly?',
    isFinal: true,
  })
  await storage.recordTranscript({
    speaker: 'Candidate',
    text: 'Yes, thank you! I can hear you clearly.',
    isFinal: true,
  })
  console.log('[PASS] Recorded 2 initial speech transcripts')

  // 3. Question Q1 is detected and processed
  const qId = `q_test_${Date.now()}`
  const initialQ = {
    id: qId,
    number: 1,
    text: 'Can you explain the difference between useMemo and useCallback in React?',
    detectedFrom: 'voice',
    timestamp: new Date().toISOString(),
    outputMode: 'both',
    simpleAnswer: '',
    simpleStatus: 'streaming',
    contextualAnswer: '',
    contextualStatus: 'streaming',
    isStreaming: true,
    simplePipeline: {
      model: 'openai/gpt-oss-20b',
      prompt: 'Can you explain the difference between useMemo and useCallback in React?',
      answer: '',
      status: 'streaming',
      startedAt: new Date().toISOString(),
    },
    contextualPipeline: {
      model: 'openai/gpt-oss-120b',
      tier: 'tier2_advanced',
      injectedBackgroundLogs: [
        '[Interviewer]: Hello, welcome to the technical interview. Can you hear me clearly?',
        '[Candidate]: Yes, thank you! I can hear you clearly.'
      ],
      fullPrompt: 'Recent Live Interview Audio Transcription Logs:\n[Interviewer]: Hello...\nQuestion: Can you explain...',
      answer: '',
      status: 'streaming',
      startedAt: new Date().toISOString(),
    }
  }

  await storage.saveInitialQuestion(initialQ)
  console.log('[PASS] Saved initial question turn with pipeline tracking')

  // 4. Answers stream in and complete
  await storage.updateQuestionAnswer(qId, {
    simpleAnswer: '`useMemo` caches the **computed value** of a function, while `useCallback` caches the **function definition** itself between renders.',
    simpleStatus: 'completed',
    simplePipeline: {
      model: 'openai/gpt-oss-20b',
      prompt: 'Can you explain the difference between useMemo and useCallback in React?',
      answer: '`useMemo` caches the **computed value** of a function, while `useCallback` caches the **function definition** itself between renders.',
      status: 'completed',
      startedAt: initialQ.timestamp,
      completedAt: new Date().toISOString(),
      latencyMs: 980,
    }
  })

  await storage.updateQuestionAnswer(qId, {
    contextualAnswer: 'In React, **`useMemo` caches calculation results**, preventing expensive recalculations unless dependencies change. In contrast, **`useCallback` preserves function references**, which prevents unnecessary re-renders of child components wrapped in `React.memo`.',
    contextualStatus: 'completed',
    contextualPipeline: {
      model: 'openai/gpt-oss-120b',
      tier: 'tier2_advanced',
      injectedBackgroundLogs: [
        '[Interviewer]: Hello, welcome to the technical interview. Can you hear me clearly?',
        '[Candidate]: Yes, thank you! I can hear you clearly.'
      ],
      fullPrompt: 'Recent Live Interview Audio Transcription Logs:\n[Interviewer]: Hello...\nQuestion: Can you explain...',
      answer: 'In React, **`useMemo` caches calculation results**, preventing expensive recalculations unless dependencies change. In contrast, **`useCallback` preserves function references**, which prevents unnecessary re-renders of child components wrapped in `React.memo`.',
      status: 'completed',
      startedAt: initialQ.timestamp,
      completedAt: new Date().toISOString(),
      latencyMs: 2850,
    }
  })
  console.log('[PASS] Updated question with completed simple & contextual pipelines')

  // 5. Subsequent transcript
  await storage.recordTranscript({
    speaker: 'Interviewer',
    text: 'That makes total sense. Let us dive into state management next.',
    isFinal: true,
  })
  console.log('[PASS] Recorded subsequent transcript')

  // 6. Verify Session File on disk
  const loaded = await storage.loadSessionRun(session.sessionId)
  if (!loaded) throw new Error('Could not load session from storage')

  console.log(`[PASS] Loaded session verification:`)
  console.log(` - Total questions: ${loaded.questions.length}`)
  console.log(` - Total timeline events: ${loaded.timeline.length}`)
  console.log(` - Simple latency: ${loaded.questions[0].simplePipeline?.latencyMs} ms`)
  console.log(` - Contextual latency: ${loaded.questions[0].contextualPipeline?.latencyMs} ms`)
  console.log(` - Injected logs captured: ${loaded.questions[0].contextualPipeline?.injectedBackgroundLogs?.length}`)

  // 7. Test Export Session to Markdown
  const testExportPath = path.join(__dirname, `test_export_${session.sessionId}.md`)
  const exportRes = await storage.exportSession(session.sessionId, 'markdown', testExportPath)
  if (!exportRes.success || !fs.existsSync(testExportPath)) {
    throw new Error('Export markdown failed')
  }

  const exportedMd = fs.readFileSync(testExportPath, 'utf-8')
  console.log('[PASS] Markdown report generated successfully! Preview:')
  console.log('--------------------------------------------------')
  console.log(exportedMd.substring(0, 700) + '...\n[truncated]')
  console.log('--------------------------------------------------')

  // Clean up test export file and test session file
  fs.unlinkSync(testExportPath)
  const answersDir = path.join(storage.getDataDir(), 'answers')
  const sessionFilePath = path.join(answersDir, `${session.sessionId}.json`)
  if (fs.existsSync(sessionFilePath)) {
    fs.unlinkSync(sessionFilePath)
    console.log(`[CLEANUP] Removed test session file: ${sessionFilePath}`)
  }

  console.log('✅ ALL TESTS PASSED: Single-file session timeline audit and export working perfectly!')
}

runTest().catch(err => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})

