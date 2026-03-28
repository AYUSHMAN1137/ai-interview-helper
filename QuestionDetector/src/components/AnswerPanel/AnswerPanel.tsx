import React from 'react'
import AnswerDisplay from './AnswerDisplay'
import SelectedQuestion from '../QuestionsPanel/SelectedQuestion'
import { useStore } from '../../store'
import './AnswerPanel.css'

const AnswerPanel: React.FC = () => {
  const { questions, selectedQuestionId } = useStore()
  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId)

  return (
    <div className="answer-panel">
      <div className="panel-header">Answer</div>
      <div className="answer-content">
        {selectedQuestion ? (
          <AnswerDisplay
            answer={selectedQuestion.answer}
            isStreaming={selectedQuestion.isStreaming}
          />
        ) : (
          <div className="placeholder-text">
            Select a question to see its answer...
          </div>
        )}
      </div>
      <SelectedQuestion text={selectedQuestion?.text || null} />
    </div>
  )
}

export default AnswerPanel
