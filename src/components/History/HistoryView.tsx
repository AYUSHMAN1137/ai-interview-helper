import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { useStore } from '../../store'
import type { Question } from '../../types/question'
import './HistoryView.css'

const HistoryMarkdown: React.FC<{ content: string }> = ({ content }) => {
  return (
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
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

const HistoryQuestionCard: React.FC<{ question: Question }> = ({ question }) => {
  const isLegacy = !question.simpleAnswer && !question.contextualAnswer && !!question.answer

  return (
    <div className="history-question-card">
      <div className="history-question-header">
        <div className="history-question-qtext">
          <span style={{ color: '#38bdf8', marginRight: '6px' }}>Q{question.number}:</span>
          {question.text}
        </div>
        <div className="history-question-meta-row">
          <span>Source: {question.detectedFrom || 'voice'}</span>
          <span>·</span>
          <span>{question.timestamp ? formatTime(question.timestamp) : ''}</span>
          {question.outputMode && (
            <>
              <span>·</span>
              <span>Mode: {question.outputMode}</span>
            </>
          )}
        </div>
      </div>

      <div className="history-question-body">
        {/* Simple Answer */}
        {question.simpleAnswer && (
          <div className="answer-section-card answer-section-card--simple" style={{ marginBottom: question.contextualAnswer ? '10px' : '0' }}>
            <div className="answer-section-header">
              <span className="answer-section-tag tag--simple">⚡ Simple Answer</span>
              <span className="answer-section-desc">Direct · Zero Context</span>
            </div>
            <div className="answer-section-body">
              <HistoryMarkdown content={question.simpleAnswer} />
            </div>
          </div>
        )}

        {/* Contextual Answer */}
        {question.contextualAnswer && (
          <div className="answer-section-card answer-section-card--contextual" style={{ marginBottom: 0 }}>
            <div className="answer-section-header">
              <span className="answer-section-tag tag--contextual">🧠 Contextual Answer</span>
              <span className="answer-section-desc">With Background Context</span>
            </div>
            <div className="answer-section-body">
              <HistoryMarkdown content={question.contextualAnswer} />
            </div>
          </div>
        )}

        {/* Legacy Answer */}
        {isLegacy && (
          <div className="answer-section-card answer-section-card--legacy" style={{ marginBottom: 0 }}>
            <div className="answer-section-header">
              <span className="answer-section-tag tag--legacy">📝 Answer (Legacy)</span>
            </div>
            <div className="answer-section-body">
              <HistoryMarkdown content={question.answer || ''} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const HistoryView: React.FC = () => {
  const {
    sessionRuns,
    selectedSessionId,
    selectedSession,
    isLoadingHistory,
    loadSessionRuns,
    selectSession,
    setCurrentView,
  } = useStore()

  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async (format: 'markdown' | 'json' = 'markdown') => {
    if (!selectedSession || isExporting) return
    setIsExporting(true)
    setExportStatus('Exporting...')
    try {
      const res = await window.electronAPI.exportSession(selectedSession.sessionId, format)
      if (res && res.success && res.filePath) {
        const basename = res.filePath.split(/[\\/]/).pop()
        setExportStatus(`Saved to ${basename}`)
        setTimeout(() => setExportStatus(null), 4000)
      } else if (res && res.canceled) {
        setExportStatus(null)
      } else {
        setExportStatus(`Export failed: ${res?.error || 'Unknown error'}`)
        setTimeout(() => setExportStatus(null), 4000)
      }
    } catch (err: any) {
      setExportStatus(`Export error: ${err.message}`)
      setTimeout(() => setExportStatus(null), 4000)
    } finally {
      setIsExporting(false)
    }
  }

  useEffect(() => {
    loadSessionRuns()
  }, [])

  return (
    <div className="history-container">
      <div className="history-topbar">
        <div className="history-topbar-title">
          <span>📜</span>
          <span>Past Interview Sessions & Questions</span>
        </div>
        <button
          className="history-back-btn"
          onClick={() => setCurrentView('live')}
          title="Return to the live overlay view"
        >
          ← Return to Live Overlay
        </button>
      </div>

      <div className="history-layout">
        {/* Sessions list sidebar */}
        <div className="history-sidebar">
          <div className="history-sidebar-header">
            <span>Sessions ({sessionRuns.length})</span>
          </div>

          <div className="history-runs-list">
            {isLoadingHistory && sessionRuns.length === 0 ? (
              <div style={{ padding: '16px 12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Loading session runs...
              </div>
            ) : sessionRuns.length === 0 ? (
              <div style={{ padding: '16px 12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                No past interview sessions found.
              </div>
            ) : (
              sessionRuns.map((run) => {
                const isActive = run.sessionId === selectedSessionId
                return (
                  <div
                    key={run.sessionId}
                    className={`history-run-item ${isActive ? 'history-run-item--active' : ''}`}
                    onClick={() => selectSession(run.sessionId)}
                  >
                    <div className="history-run-date">
                      <span>{formatDate(run.startedAt || run.date)}</span>
                      {run.isLegacy && <span className="legacy-badge">Legacy</span>}
                    </div>
                    <div className="history-run-sub">
                      <span>{formatTime(run.startedAt)}</span>
                      <span>{run.questionCount} question{run.questionCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Selected session questions detail */}
        <div className="history-detail-panel">
          {selectedSession ? (
            <>
              <div className="history-detail-header">
                <div>
                  <span className="history-detail-title">
                    Session: {formatDate(selectedSession.startedAt || selectedSession.date)}
                  </span>
                  <span className="history-detail-meta" style={{ marginLeft: '10px' }}>
                    {formatTime(selectedSession.startedAt)}
                  </span>
                  {selectedSession.stats?.totalTranscripts !== undefined && (
                    <span className="history-detail-meta" style={{ marginLeft: '10px' }}>
                      · {selectedSession.stats.totalTranscripts} speech logs
                    </span>
                  )}
                </div>
                <div className="history-header-actions">
                  <div className="history-detail-meta" style={{ marginRight: '6px' }}>
                    {selectedSession.questions.length} question{selectedSession.questions.length !== 1 ? 's' : ''}
                  </div>
                  {exportStatus && (
                    <span className="history-export-status">{exportStatus}</span>
                  )}
                  <button
                    className="history-export-btn"
                    onClick={() => handleExport('markdown')}
                    disabled={isExporting}
                    title="Export complete session report (Markdown with answers, prompts, and timestamps)"
                  >
                    📥 Export Session (.md)
                  </button>
                  <button
                    className="history-export-btn history-export-btn--secondary"
                    onClick={() => handleExport('json')}
                    disabled={isExporting}
                    title="Export raw complete session data as JSON"
                  >
                    JSON
                  </button>
                </div>
              </div>

              <div className="history-questions-scroll">
                {selectedSession.questions.length === 0 ? (
                  <div className="history-empty-state">
                    <span>No questions recorded in this session.</span>
                  </div>
                ) : (
                  selectedSession.questions.map((q) => (
                    <HistoryQuestionCard key={q.id} question={q} />
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="history-empty-state">
              <span>Select an interview session on the left to inspect its questions and answers.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default HistoryView

