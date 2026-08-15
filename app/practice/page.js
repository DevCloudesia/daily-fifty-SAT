import Script from 'next/script';

const S = ({ id, c = '', children, ...props }) => <span id={id} className={c} {...props}>{children}</span>;

export default function Page() {
  return <>
    <div id="app" className="app-shell">
      <header className="topbar">
        <a className="brand" href="/"><S c="brand-mark">50</S><span><strong>The Daily Fifty</strong><small>Focused SAT practice</small></span></a>
        <div className="topbar-center">
          <div className="progress-copy"><S id="progressLabel">0 of 50 complete</S><S id="mixLabel">25 hard R&amp;W + 5 vocab · 20 hard Math</S></div>
          <div className="progress-track"><div id="progressBar" className="progress-fill" /></div>
        </div>
        <div className="topbar-actions">
          <button id="musicButton" className="icon-button" aria-pressed="false">♫ <S id="musicLabel">Quiet music</S></button>
          <button id="focusButton" className="icon-button compact" aria-label="Toggle fullscreen">⌗</button>
        </div>
      </header>
      <main id="practiceWorkspace" className="workspace">
        <div id="studySplit" className="study-split">
          <section className="question-column">
            <div className="question-toolbar">
              <div className="question-meta">
                <S id="subjectBadge" c="badge badge-reading">Reading &amp; Writing</S>
                <S id="difficultyBadge" c="badge badge-hard">Hard</S>
                <S id="skillLabel" c="skill-label">Opening your next question…</S>
              </div>
              <div className="timer-wrap">
                <svg className="timer-ring" width="54" height="54" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                  <circle className="timer-ring-bg" cx="22" cy="22" r="18" fill="none" />
                  <circle
                    id="timerRing"
                    className="timer-ring-value"
                    cx="22"
                    cy="22"
                    r="18"
                    fill="none"
                    style={{
                      vectorEffect: 'none',
                      strokeDasharray: '113.09733552923255 113.09733552923255',
                      strokeDashoffset: '0',
                    }}
                  />
                </svg>
                <div className="timer-copy"><strong id="timerText">60</strong><span>seconds</span></div>
              </div>
            </div>
            <section className="question-panel card">
              <div id="questionStage" className="question-stage">
                <article id="questionCard" className="question-card" aria-live="polite">
                  <div className="skeleton skeleton-title" /><div className="skeleton" /><div className="skeleton" />
                </article>
                <div id="calculatorDivider" className="calculator-divider legacy-calculator-divider hidden" role="separator" aria-label="Legacy calculator resize hook" aria-orientation="vertical" aria-valuemin="30" aria-valuemax="70" aria-valuenow="50" tabIndex="-1"><span aria-hidden="true" /></div>
              </div>
              <div className="below-question-actions">
                <button id="previousButton" className="button button-ghost">← Previous</button>
                <button id="calculatorButton" className="button button-calculator hidden" type="button" aria-controls="calculatorPane" aria-expanded="false">Desmos Calculator</button>
                <button id="skipButton" className="button button-ghost">Skip for now →</button>
              </div>
            </section>
          </section>
          <div id="workspaceDivider" className="workspace-divider hidden" role="separator" aria-label="Resize question and Desmos Calculator" aria-orientation="vertical" aria-valuemin="30" aria-valuemax="70" aria-valuenow="50" tabIndex="0"><span aria-hidden="true" /></div>
          <aside id="calculatorPane" className="calculator-pane hidden" aria-label="Desmos Calculator" tabIndex="-1">
            <div className="calculator-header">
              <div><strong>Desmos Calculator</strong><small>College Board graphing calculator</small></div>
              <button id="closeCalculator" className="calculator-close" type="button" aria-label="Close Desmos Calculator">×</button>
            </div>
            <iframe
              id="desmosFrame"
              className="desmos-frame"
              title="Desmos College Board graphing calculator"
              data-src="https://www.desmos.com/testing/collegeboard/graphing"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="clipboard-write"
            />
          </aside>
        </div>
        <aside id="answerColumn" className="answer-column">
          <section id="answerCard" className="answer-card card">
            <div className="answer-header"><div><S c="eyebrow">Your answer</S><h2>Respond carefully</h2></div><S id="questionCounter" c="counter-pill">1 / 50</S></div>
            <div id="answerArea" className="answer-area" />
            <div id="feedback" className="feedback hidden" />
            <div className="primary-actions">
              <button id="checkButton" className="button button-primary" disabled>Check answer</button>
              <button id="revealButton" className="button button-secondary">Show answer</button>
            </div>
            <button id="completeButton" className="button button-complete" disabled>Mark complete and retire question</button>
            <p className="retire-note">Once a question is shown, it will not appear in a future set.</p>
            <div id="answerExplanationSlot" className="answer-explanation-slot" />
          </section>
        </aside>
        <div id="workspaceExplanationSlot" className="workspace-explanation-slot">
          <section id="explanationCard" className="explanation-card card hidden">
            <div className="explanation-heading"><div><S c="eyebrow">Explanation</S><h2>Why it works</h2></div><button id="collapseExplanation" className="icon-button compact" aria-label="Collapse explanation">−</button></div>
            <div id="explanationContent" className="rich-content explanation-content" />
          </section>
        </div>
      </main>
      <section className="navigator card">
        <div className="navigator-summary"><span>Current</span><span>Correct</span><span>Wrong</span><span>Overtime</span></div>
        <div id="questionNavigator" className="question-grid" />
      </section>
    </div>
    <div id="loadingOverlay" className="loading-overlay hidden" role="status" aria-live="polite" aria-label="Loading your first question">
      <div className="df-loading-card">
        <div className="df-loading-lines" aria-hidden="true"><span /><span /><span /></div>
        <p className="loading-label">Preparing your question</p>
        <div className="df-loading-progress" aria-hidden="true"><span /></div>
        <blockquote id="loadingMessage">One question is small enough to solve.</blockquote>
      </div>
    </div>
    <div id="errorOverlay" className="error-overlay hidden">
      <div className="error-card card"><S c="error-icon">!</S><h1>We lost the thread for a moment.</h1><p id="errorMessage">Your progress is safe. Tap retry.</p><button id="retryButton" className="button button-primary">Retry</button><a href="/">Return home</a></div>
    </div>
    <div id="toast" className="toast hidden" />
    <Script type="module" src="/practice-app.js" strategy="afterInteractive" />
    <Script type="module" src="/desmos-workspace.js" strategy="afterInteractive" />
  </>;
}
