import React from 'react'

interface QuestionItemProps {
  id: string
  number: number
  text: string
  isSelected: boolean
  isStreaming: boolean
  onClick: () => void
}

const QuestionItem: React.FC<QuestionItemProps> = ({
  number,
  text,
  isSelected,
  isStreaming,
  onClick,
}) => {
  return (
    <div
      className={`question-item ${isSelected ? 'question-item--selected' : ''}`}
      onClick={onClick}
    >
      <span className="question-number">Q{number}:</span>
      <span className="question-text">{text}</span>
      {isStreaming && <span className="streaming-dot">●</span>}
    </div>
  )
}

export default QuestionItem
