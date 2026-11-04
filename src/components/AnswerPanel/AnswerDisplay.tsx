import React, { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { useStore } from '../../store'
import type { Question } from '../../types/question'

interface AnswerDisplayProps {
  question: Question
}

const MarkdownContent: React.FC<{ content: string; isStreaming?: boolean }> = ({ content, isStreaming }) => {
  return (
    <>
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
                  padding: '10px',
                  fontSize: '11px',
                  margin: '6px 0',
                  overflowX: 'auto',
                }}
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className="inline-code" {...props}>
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
        {content || ''}
      </ReactMarkdown>
      {isStreaming && <span className="streaming-cursor">▌</span>}
    </>
  )
}

const AnswerDisplay: React.FC<AnswerDisplayProps> = ({ question }) => {
  const simpleBodyRef = useRef<HTMLDivElement>(null)
  const contextualBodyRef = useRef<HTMLDivElement>(null)
  const singleBodyRef = useRef<HTMLDivElement>(null)

  const [simpleCollapsed, setSimpleCollapsed] = useState(false)
  const [contextualCollapsed, setContextualCollapsed] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // STICKY SCROLL FIX: When selected question changes, scroll to top ONCE.
  // During streaming, NEVER touch scrollTop — let user read peacefully from top!
  useEffect(() => {
    if (simpleBodyRef.current) simpleBodyRef.current.scrollTop = 0
    if (contextualBodyRef.current) contextualBodyRef.current.scrollTop = 0
    if (singleBodyRef.current) singleBodyRef.current.scrollTop = 0
  }, [question.id])

  const handleRegenerate = async (tier: 'instant' | 'balanced' | 'deep') => {
    if (!window.electronAPI || !question.id || !question.text) return
    setRegenerating(true)
    try {
      await window.electronAPI.regenerateQuestion(question.id, question.text, tier, 'contextual')
    } finally {
      setRegenerating(false)
    }
  }

  const { answerOutputMode } = useStore()

  // Pure legacy check: questions from before the dual answer feature that only have `answer`
  const isLegacy = !question.simpleAnswer && !question.contextualAnswer && !!question.answer && !question.simpleStatus && !question.contextualStatus

  // Determine mode: prefer user's active mode from segmented bar, falling back to question's outputMode
  const mode = isLegacy ? 'legacy' : (answerOutputMode || question.outputMode || 'both')
  const isSplit = mode === 'both' && !isLegacy
  const showSimple = !isLegacy && (mode === 'both' || mode === 'simple')
  const showContextual = !isLegacy && (mode === 'both' || mode === 'contextual')

  return (
    <div className="answer-display">
      {/* SIDE-BY-SIDE SPLIT VIEW WHEN BOTH MODE IS ACTIVE */}
      {isSplit && (
        <div className="answer-split-grid">
          {/* COLUMN 1: SIMPLE ANSWER */}
          <div className={`answer-section-card answer-section-card--simple ${simpleCollapsed ? 'card--collapsed' : ''}`}>
            <div
              className="answer-section-header"
              onClick={() => setSimpleCollapsed(!simpleCollapsed)}
              title={simpleCollapsed ? 'Click to expand Simple Answer' : 'Click to collapse'}
            >
              <div className="answer-section-title-wrap">
                <span className="answer-section-tag tag--simple">⚡ Simple</span>
                <span className="answer-section-desc">Direct · Instant</span>
              </div>
              <div className="answer-section-actions" onClick={(e) => e.stopPropagation()}>
                {question.simpleStatus === 'streaming' && (
                  <span className="status-pill status-pill--streaming">● Live</span>
                )}
                {question.simpleStatus === 'failed' && (
                  <span className="status-pill status-pill--failed">Failed</span>
                )}
                <button
                  className="section-toggle-btn"
                  onClick={() => setSimpleCollapsed(!simpleCollapsed)}
                  title={simpleCollapsed ? 'Expand' : 'Collapse'}
                >
                  {simpleCollapsed ? '+' : '−'}
                </button>
              </div>
            </div>

            {!simpleCollapsed && (
              <div className="answer-section-body" ref={simpleBodyRef}>
                {question.simpleAnswer ? (
                  <MarkdownContent
                    content={question.simpleAnswer}
                    isStreaming={question.simpleStatus === 'streaming'}
                  />
                ) : question.simpleStatus === 'streaming' ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Generating fast answer... <span className="streaming-cursor">▌</span>
                  </div>
                ) : question.simpleError ? (
                  <div className="answer-error-msg">{question.simpleError}</div>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>No simple answer generated.</div>
                )}
              </div>
            )}
          </div>

          {/* COLUMN 2: CONTEXTUAL ANSWER */}
          <div className={`answer-section-card answer-section-card--contextual ${contextualCollapsed ? 'card--collapsed' : ''}`}>
            <div
              className="answer-section-header"
              onClick={() => setContextualCollapsed(!contextualCollapsed)}
              title={contextualCollapsed ? 'Click to expand Contextual Answer' : 'Click to collapse'}
            >
              <div className="answer-section-title-wrap">
                <span className="answer-section-tag tag--contextual">🧠 Contextual</span>
                <span className="answer-section-desc">With Recent Context</span>
              </div>
              <div className="answer-section-actions" onClick={(e) => e.stopPropagation()}>
                {question.contextualStatus === 'streaming' && (
                  <span className="status-pill status-pill--streaming">● Live</span>
                )}
                {question.contextualStatus === 'failed' && (
                  <span className="status-pill status-pill--failed">Failed</span>
                )}
                <button
                  className="section-toggle-btn"
                  onClick={() => setContextualCollapsed(!contextualCollapsed)}
                  title={contextualCollapsed ? 'Expand' : 'Collapse'}
                >
                  {contextualCollapsed ? '+' : '−'}
                </button>
              </div>
            </div>

            {!contextualCollapsed && (
              <div className="answer-section-body" ref={contextualBodyRef}>
                {question.contextualAnswer ? (
                  <MarkdownContent
                    content={question.contextualAnswer}
                    isStreaming={question.contextualStatus === 'streaming'}
                  />
                ) : question.contextualStatus === 'streaming' ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Generating contextual answer... <span className="streaming-cursor">▌</span>
                  </div>
                ) : question.contextualError ? (
                  <div className="answer-error-msg">{question.contextualError}</div>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>No contextual answer generated.</div>
                )}

                {/* Regenerate bar on Contextual section */}
                {question.contextualStatus === 'completed' && question.contextualAnswer && (
                  <div className="regen-bar">
                    <span className="regen-label">Regen:</span>
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
                      title="Deep model — gpt-oss-120b"
                    >
                      🧠 Deep
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SINGLE COLUMN VIEW WHEN ONLY ONE SECTION IS ACTIVE OR LEGACY */}
      {!isSplit && (
        <div className="answer-single-column">
          {showSimple && !isLegacy && (
            <div className="answer-section-card answer-section-card--simple">
              <div className="answer-section-header">
                <div className="answer-section-title-wrap">
                  <span className="answer-section-tag tag--simple">⚡ Simple Answer</span>
                  <span className="answer-section-desc">Direct · Zero Context · Instant</span>
                </div>
                {question.simpleStatus === 'streaming' && (
                  <span className="status-pill status-pill--streaming">● Live</span>
                )}
              </div>
              <div className="answer-section-body" ref={singleBodyRef}>
                {question.simpleAnswer ? (
                  <MarkdownContent
                    content={question.simpleAnswer}
                    isStreaming={question.simpleStatus === 'streaming'}
                  />
                ) : question.simpleStatus === 'streaming' ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Generating fast answer... <span className="streaming-cursor">▌</span>
                  </div>
                ) : (
                  <div className="answer-error-msg">{question.simpleError || 'No answer available.'}</div>
                )}
              </div>
            </div>
          )}

          {showContextual && !isLegacy && (
            <div className="answer-section-card answer-section-card--contextual">
              <div className="answer-section-header">
                <div className="answer-section-title-wrap">
                  <span className="answer-section-tag tag--contextual">🧠 Contextual Answer</span>
                  <span className="answer-section-desc">With Recent Background Context</span>
                </div>
                {question.contextualStatus === 'streaming' && (
                  <span className="status-pill status-pill--streaming">● Live</span>
                )}
              </div>
              <div className="answer-section-body" ref={singleBodyRef}>
                {question.contextualAnswer ? (
                  <MarkdownContent
                    content={question.contextualAnswer}
                    isStreaming={question.contextualStatus === 'streaming'}
                  />
                ) : question.contextualStatus === 'streaming' ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Generating contextual answer... <span className="streaming-cursor">▌</span>
                  </div>
                ) : (
                  <div className="answer-error-msg">{question.contextualError || 'No answer available.'}</div>
                )}

                {question.contextualStatus === 'completed' && question.contextualAnswer && (
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
                      title="Best model — gpt-oss-120b"
                    >
                      🧠 Deep
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {isLegacy && (
            <div className="answer-section-card answer-section-card--legacy">
              <div className="answer-section-header">
                <span className="answer-section-tag tag--legacy">📝 Answer (Legacy)</span>
              </div>
              <div className="answer-section-body" ref={singleBodyRef}>
                <MarkdownContent
                  content={question.answer || ''}
                  isStreaming={question.isStreaming}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AnswerDisplay
