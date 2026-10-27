import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, RotateCcw, Sparkles } from 'lucide-react';
import Page from '../components/ui/Page';
import { useTrades } from '../context/TradesContext';
import { askCoach, buildCoachContext, useCoachSources } from '../utils/coach';

const SUGGESTIONS = [
  "What's my best setup, and what's my worst?",
  'Which of my own rules do I break most often?',
  'What do my biggest losses have in common?',
  'How much are fees costing me, and what would change that?',
  'Am I trading worse after a losing streak?',
  'Which emotion going in costs me the most?',
];

const md = {
  p: ({ node, ...props }) => <p className="mb-3 last:mb-0 leading-7" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-3 ml-5 list-disc space-y-1" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-3 ml-5 list-decimal space-y-1" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-content-primary" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mb-2 mt-3 font-semibold text-content-primary" {...props} />,
  table: ({ node, ...props }) => <div className="mb-3 overflow-x-auto"><table className="w-full text-sm tabular-nums" {...props} /></div>,
  th: ({ node, ...props }) => <th className="border-b border-line-strong px-2 py-1 text-left font-medium" {...props} />,
  td: ({ node, ...props }) => <td className="border-b border-line px-2 py-1" {...props} />,
  code: ({ node, ...props }) => <code className="rounded bg-black/40 px-1 text-brand-hover" {...props} />,
};

/**
 * Ask the AI coach about your own trading. The journal data is captured once
 * when the conversation starts and reused for follow-ups, so the server can
 * serve it from cache; "New conversation" takes a fresh copy.
 */
function Coach() {
  const { trades, loading } = useTrades();
  const sources = useCoachSources();
  const [turns, setTurns] = useState([]); // { role: 'user' | 'assistant', text }
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const contextRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, busy]);

  const ask = async (question) => {
    const q = question.trim();
    if (!q || busy) return;
    if (!contextRef.current) contextRef.current = buildCoachContext(trades, sources);
    setError('');
    setDraft('');
    const history = turns;
    setTurns([...history, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const { answer, truncated } = await askCoach({ context: contextRef.current, history, question: q });
      setTurns((t) => [...t, { role: 'assistant', text: truncated ? `${answer}\n\n_(Answer was cut off.)_` : answer }]);
    } catch (err) {
      setError(err.message || 'The coach could not answer.');
      // Drop the unanswered question so the history stays user/assistant pairs.
      setTurns(history);
      setDraft(q);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setTurns([]);
    setError('');
    contextRef.current = null;
  };

  return (
    <Page
      primaryAction={turns.length > 0 && { label: 'New conversation', icon: RotateCcw, onClick: reset, disabled: busy, variant: 'secondary' }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {turns.length === 0 && (
          <div className="card-glow glow-brand rounded-card bg-surface p-5 shadow-elev-1 md:p-6">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-content-primary">
              <Sparkles size={16} className="text-brand" /> Ask about your trading
            </p>
            <p className="mb-4 text-sm text-content-secondary">
              The coach reads your closed trades, stats, strategies, rule notes, Playbook and risk settings, and
              answers from that data, citing trades by number. It doesn't predict the market.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={loading}
                  onClick={() => ask(s)}
                  className="rounded-full border border-line-strong bg-surface-raised px-3 py-1.5 text-left text-sm text-content-secondary hover:border-brand/50 hover:text-content-primary disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          t.role === 'user' ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-card rounded-br-md bg-brand px-4 py-2.5 text-sm text-content-primary">
              {t.text}
            </div>
          ) : (
            <div key={i} className="rounded-card bg-surface px-5 py-4 text-sm text-content-secondary shadow-elev-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>{t.text}</ReactMarkdown>
            </div>
          )
        ))}

        {busy && (
          <div className="flex items-center gap-2 rounded-card bg-surface px-5 py-4 text-sm text-content-muted shadow-elev-1">
            <Sparkles size={14} className="animate-pulse text-brand" /> Reading your journal…
          </div>
        )}
        {error && <p className="text-sm text-loss">{error}</p>}
        <div ref={endRef} />

        <form
          onSubmit={(e) => { e.preventDefault(); ask(draft); }}
          className="sticky bottom-4 flex items-end gap-2 rounded-card border border-line-strong bg-surface-raised p-2 shadow-elev-2 focus-within:border-brand"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(draft); }
            }}
            rows={1}
            placeholder={turns.length ? 'Ask a follow-up…' : 'Ask about your trades…'}
            aria-label="Question for the coach"
            className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-content-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim() || loading}
            aria-label="Ask"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control bg-brand text-content-primary transition-colors hover:bg-brand-hover disabled:opacity-40"
          >
            <ArrowUp size={18} />
          </button>
        </form>
      </div>
    </Page>
  );
}

export default Coach;
