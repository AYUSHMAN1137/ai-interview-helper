import React from 'react'
import QuestionItem from './QuestionItem'
import { useStore } from '../../store'
import './QuestionsPanel.css'

const QuestionsPanel: React.FC = () => {
  const { questions, selectedQuestionId, selectQuestion } = useStore()

  return (
    <div className="questions-panel">
      <div className="panel-header">Questions</div>
      <div className="questions-list">
        {questions.length === 0 ? (
          <div className="placeholder-text">
            Questions will appear here when detected...
          </div>
        ) : (
          questions.map((q) => (
            <QuestionItem
              key={q.id}
              id={q.id}
              number={q.number}
              text={q.text}
              isSelected={q.id === selectedQuestionId}
              isStreaming={q.isStreaming}
              onClick={() => selectQuestion(q.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default QuestionsPanel
