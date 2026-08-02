import { AlertTriangle, CheckCircle2, LineChart, RefreshCw, Sparkles, Target } from 'lucide-react';

const GRADE_STYLES = {
  A: 'bg-profit/15 text-profit border-profit/30',
  B: 'bg-profit/10 text-profit/90 border-profit/20',
  C: 'bg-warn/15 text-warn border-warn/30',
  D: 'bg-caution/15 text-caution border-caution/30',
  F: 'bg-loss/15 text-loss border-loss/30'
};

const VERDICT_STYLES = {
  kept: 'bg-profit/15 text-profit',
  partial: 'bg-warn/15 text-warn',
  broken: 'bg-loss/15 text-loss',
  no_data: 'bg-surface-hover text-content-secondary',
  good: 'bg-profit/15 text-profit',
  acceptable: 'bg-warn/15 text-warn',
  poor: 'bg-loss/15 text-loss',
  unclear: 'bg-surface-hover text-content-secondary'
};

const SEVERITY_BORDER = {
  high: 'border-l-loss',
  medium: 'border-l-caution',
  low: 'border-l-warn'
};

const VERDICT_LABELS = {
  kept: 'Kept',
  partial: 'Partial',
  broken: 'Broken',
  no_data: 'Not tested'
};

function SectionTitle({ icon: Icon, children, accent = 'text-content-secondary' }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2 ${accent}`}>
      <Icon size={13} />
      {children}
    </div>
  );
}

function TradeRefs({ refs, tradesByRef }) {
  if (!refs?.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {refs.map((ref) => {
        const trade = tradesByRef?.get(ref);
        const label = trade
          ? `${ref} · ${trade.ticker || 'BTC'} ${(trade.direction || '').toUpperCase()}`
          : ref;
        return (
          <span
            key={ref}
            className="text-[11px] font-medium bg-surface-raised rounded px-1.5 py-0.5 text-content-secondary"
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function WeeklyReport({
  doc,
  tradesByRef,
  generating,
  chartsPending,
  error,
  hasCharts,
  onGenerate
}) {
  if (!doc && !generating) {
    return (
      <div className="bg-surface-raised rounded-control p-4">
        <SectionTitle icon={Sparkles} accent="text-brand">Coach Review</SectionTitle>
        <p className="text-sm text-content-secondary mb-3">
          Generate a written review of this week — your trades, your comments, your journal, and your charts,
          graded against the commitments you made last week.
        </p>
        {error && <p className="text-xs text-loss mb-3">{error}</p>}
        <button
          onClick={onGenerate}
          className="bg-brand hover:bg-brand-hover transition-colors rounded-lg px-4 py-2 text-sm text-content-primary font-medium active:scale-95"
        >
          Generate report
        </button>
      </div>
    );
  }

  if (generating && !doc) {
    return (
      <div className="bg-surface-raised rounded-control p-4">
        <SectionTitle icon={Sparkles} accent="text-brand">Coach Review</SectionTitle>
        <p className="text-sm text-content-secondary animate-pulse">
          Reading your trades, comments and journal…
        </p>
      </div>
    );
  }

  const report = doc.report || {};
  const generatedAt = doc.generatedAt?.toDate?.();

  return (
    <div className="bg-surface-raised rounded-control p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`w-11 h-11 rounded-lg border flex items-center justify-center text-xl font-bold flex-shrink-0 ${
              GRADE_STYLES[report.grade] || GRADE_STYLES.C
            }`}
          >
            {report.grade || '—'}
          </div>
          <div>
            <p className="text-content-primary text-sm font-medium leading-snug">{report.headline}</p>
            <p className="text-content-muted text-xs mt-1">{report.gradeReason}</p>
          </div>
        </div>
        <button
          onClick={onGenerate}
          disabled={generating}
          title="Regenerate report"
          className="text-content-muted hover:text-content-primary transition-colors disabled:opacity-40 flex-shrink-0"
        >
          <RefreshCw size={15} className={generating ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <p className="text-xs text-loss">{error}</p>}

      {/* Last week's commitments */}
      {report.lastWeekReview?.length > 0 && (
        <div>
          <SectionTitle icon={Target}>Last week you committed to</SectionTitle>
          <div className="space-y-2">
            {report.lastWeekReview.map((item, i) => (
              <div key={i} className="bg-surface rounded-card p-3 shadow-elev-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm text-content-secondary">{item.commitment}</span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 flex-shrink-0 ${
                      VERDICT_STYLES[item.verdict] || VERDICT_STYLES.no_data
                    }`}
                  >
                    {VERDICT_LABELS[item.verdict] || item.verdict}
                  </span>
                </div>
                <p className="text-xs text-content-secondary">{item.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What broke */}
      {report.whatBroke?.length > 0 && (
        <div>
          <SectionTitle icon={AlertTriangle} accent="text-loss/80">What broke</SectionTitle>
          <div className="space-y-2">
            {report.whatBroke.map((item, i) => (
              <div
                key={i}
                className={`bg-surface border-l-2 rounded-card p-3 ${
 SEVERITY_BORDER[item.severity] || SEVERITY_BORDER.low
 } shadow-elev-1`}
              >
                <p className="text-sm text-content-primary font-medium">{item.claim}</p>
                <p className="text-xs text-content-secondary mt-1">{item.detail}</p>
                <TradeRefs refs={item.tradeRefs} tradesByRef={tradesByRef} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What worked */}
      {report.whatWorked?.length > 0 && (
        <div>
          <SectionTitle icon={CheckCircle2} accent="text-profit/80">What worked</SectionTitle>
          <div className="space-y-2">
            {report.whatWorked.map((item, i) => (
              <div key={i} className="bg-surface rounded-card p-3 shadow-elev-1">
                <p className="text-sm text-content-primary font-medium">{item.claim}</p>
                <p className="text-xs text-content-secondary mt-1">{item.detail}</p>
                <TradeRefs refs={item.tradeRefs} tradesByRef={tradesByRef} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chart review */}
      {(doc.chartNotes?.length > 0 || chartsPending || doc.chartError) && (
        <div>
          <SectionTitle icon={LineChart}>Chart review</SectionTitle>
          {chartsPending && (
            <p className="text-xs text-content-muted animate-pulse">Looking at your charts…</p>
          )}
          {!chartsPending && doc.chartError && (
            <p className="text-xs text-loss">{doc.chartError}</p>
          )}
          <div className="space-y-2">
            {doc.chartNotes?.map((note, i) => {
              const trade = tradesByRef?.get(note.ref);
              return (
                <div key={i} className="bg-surface rounded-card p-3 shadow-elev-1">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-content-secondary">
                      {note.ref}
                      {trade && (
                        <span className="text-content-muted font-normal">
                          {' '}· {trade.ticker || 'BTC'} {(trade.direction || '').toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${
                        VERDICT_STYLES[note.verdict] || VERDICT_STYLES.unclear
                      }`}
                    >
                      {note.verdict}
                    </span>
                  </div>
                  <p className="text-xs text-content-secondary">
                    <span className="text-content-muted">Setup — </span>
                    {note.setup}
                  </p>
                  <p className="text-xs text-content-secondary mt-1">
                    <span className="text-content-muted">Execution — </span>
                    {note.execution}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Next week */}
      {report.commitments?.length > 0 && (
        <div>
          <SectionTitle icon={Target} accent="text-brand">Commit to this next week</SectionTitle>
          <div className="bg-brand/5 border border-brand/20 rounded-lg p-3 space-y-2.5">
            {report.commitments.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-brand text-xs font-bold mt-0.5 flex-shrink-0">{i + 1}</span>
                <div>
                  <p className="text-sm text-content-primary">{item.commitment}</p>
                  <p className="text-[11px] text-content-muted mt-0.5">Checked by: {item.measurable}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-content-muted pt-1">
        <span>
          {generatedAt
            ? `Generated ${generatedAt.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}`
            : 'Generated'}
        </span>
        {!hasCharts && <span>No chart screenshots this week</span>}
      </div>
    </div>
  );
}

export default WeeklyReport;
