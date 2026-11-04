import React, { useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'

interface AnswerDisplayProps {
  answer: string
  isStreaming: boolean
  questionId?: string
  questionText?: string
}

const AnswerDisplay: React.FC<AnswerDisplayProps> = ({ answer, isStreaming, questionId, questionText }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [regenerating, setRegenerating] = React.useState(false)

  const handleRegenerate = async (tier: 'instant' | 'balanced' | 'deep') => {
    if (!window.electronAPI || !questionId || !questionText) return
    setRegenerating(true)
    try {
      await window.electronAPI.regenerateQuestion(questionId, questionText, tier)
    } finally {
      setRegenerating(false)
    }
  }

  useEffect(() => {
    // Auto-scroll to bottom while streaming
    if (isStreaming && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [answer, isStreaming])

  return (
    <div className="answer-display" ref={containerRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const inline = !match
            return !inline ? (
              <SyntaxHighlighter
                style={vscDarkPlus as any}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  background: 'rgba(0, 0, 0, 0.45)',
                  borderRadius: '4px',
                  padding: '12px',
                  fontSize: '12px',
                  margin: '8px 0',
                  overflowX: 'auto',
                }}
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code
                className="inline-code"
                {...props}
              >
                {children}
              </code>
            )
          },
          p({ children }: any) {
            return <p className="md-paragraph">{children}</p>
          },
          h1({ children }: any) { return <h1 className="md-heading">{children}</h1> },
          h2({ children }: any) { return <h2 className="md-heading">{children}</h2> },
          h3({ children }: any) { return <h3 className="md-heading">{children}</h3> },
          ul({ children }: any) { return <ul className="md-list">{children}</ul> },
          ol({ children }: any) { return <ol className="md-list">{children}</ol> },
          li({ children }: any) { return <li className="md-list-item">{children}</li> },
          strong({ children }: any) { return <strong className="md-bold">{children}</strong> },
          em({ children }: any) { return <em className="md-italic">{children}</em> },
        }}
      >
        {answer || ''}
      </ReactMarkdown>
      {!isStreaming && answer && questionId && (
        <div className="regen-bar">
          <span className="regen-label">Regenerate:</span>
          <button
            className="regen-btn"
            onClick={() => handleRegenerate('instant')}
            disabled={regenerating}
            title="Fast model — gpt-oss-20b"
          >
            ⚡ Instant
          </button>
          <button
            className="regen-btn"
            onClick={() => handleRegenerate('balanced')}
            disabled={regenerating}
            title="Technical model — qwen3.8-27b"
          >
            ⚖️ Balanced
          </button>
          <button
            className="regen-btn regen-btn--deep"
            onClick={() => handleRegenerate('deep')}
            disabled={regenerating}
            title="Best model — gpt-oss-120b (coding / system design)"
          >
            🧠 Deep
          </button>
        </div>
      )}
      {isStreaming && <span className="streaming-cursor">▌</span>}
    </div>
  )
}

export default AnswerDisplay
