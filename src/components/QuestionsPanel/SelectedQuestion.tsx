import React from 'react'

interface SelectedQuestionProps {
  text: string | null
}

const SelectedQuestion: React.FC<SelectedQuestionProps> = ({ text }) => {
  return (
    <div className="selected-question">
      <div className="selected-question-label">Selected Question</div>
      <div className="selected-question-text">
        {text || 'Select a question to see its answer...'}
      </div>
    </div>
  )
}

export default SelectedQuestion
