import React from 'react'
import AnswerDisplay from './AnswerDisplay'
import SelectedQuestion from '../QuestionsPanel/SelectedQuestion'
import { useStore } from '../../store'
import type { AnswerOutputMode } from '../../types/question'
import './AnswerPanel.css'

const AnswerPanel: React.FC = () => {
  const { questions, selectedQuestionId, answerOutputMode, setAnswerOutputMode } = useStore()
  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId)

  const handleModeChange = (mode: AnswerOutputMode) => {
    setAnswerOutputMode(mode)
  }

  return (
    <div className="answer-panel">
      <div className="answer-header-row">
        <span className="answer-panel-title">Answer</span>
        <div className="mode-segmented-bar" title="Select answer mode for upcoming questions">
          <button
            className={`mode-segment-btn ${answerOutputMode === 'both' ? 'mode-segment-btn--active' : ''}`}
            onClick={() => handleModeChange('both')}
            title="Generate both Simple and Contextual answers in parallel"
          >
            Both
          </button>
          <button
            className={`mode-segment-btn ${answerOutputMode === 'simple' ? 'mode-segment-btn--active' : ''}`}
            onClick={() => handleModeChange('simple')}
            title="Generate only Simple (Direct & Fast) answer"
          >
            Simple
          </button>
          <button
            className={`mode-segment-btn ${answerOutputMode === 'contextual' ? 'mode-segment-btn--active' : ''}`}
            onClick={() => handleModeChange('contextual')}
            title="Generate only Contextual answer"
          >
            Contextual
          </button>
        </div>
      </div>

      <div className="answer-content">
        {selectedQuestion ? (
          <AnswerDisplay question={selectedQuestion} />
        ) : (
          <div className="placeholder-text" style={{ padding: '24px 12px', color: 'var(--text-secondary)' }}>
            Select a question on the left to view its answers...
          </div>
        )}
      </div>
      <SelectedQuestion text={selectedQuestion?.text || null} />
    </div>
  )
}

export default AnswerPanel
