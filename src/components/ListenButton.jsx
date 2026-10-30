import { useEffect, useSyncExternalStore } from 'react';
import { Pause, Play, Square, Volume2 } from 'lucide-react';
import { currentVoiceURI, cycleRate, getState, listVoices, pause, resume, setVoice, speak, speechSupported, stop, subscribe, voiceLabel } from '../utils/speech';

/**
 * Reads `text` aloud with the browser's built-in voice. One reading at a time
 * app-wide: starting another card stops this one. Stops when unmounted (card
 * closed). Renders nothing where the browser has no speech engine.
 *
 * `id` must be unique per card (e.g. `note-<id>`).
 */
function ListenButton({ id, text, compact = false, className = '' }) {
  const s = useSyncExternalStore(subscribe, getState);
  useEffect(() => () => stop(id), [id]);
  if (!speechSupported()) return null;

  const mine = s.id === id;
  const btn = 'inline-flex items-center justify-center gap-1.5 rounded-control border text-sm transition-colors';
  const idle = 'border-line-strong bg-surface-raised text-content-secondary hover:border-brand/50 hover:text-content-primary';
  const size = compact ? 'h-8 px-2.5 text-xs' : 'h-9 px-3';

  if (!mine) {
    return (
      <button type="button" onClick={() => speak(id, text)} className={`${btn} ${idle} ${size} ${className}`} aria-label="Read aloud">
        <Volume2 size={compact ? 13 : 14} /> Listen
      </button>
    );
  }

  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} role="group" aria-label="Read aloud controls">
      <button
        type="button"
        onClick={s.status === 'speaking' ? pause : resume}
        className={`${btn} ${size} border-brand/45 bg-brand-muted text-content-primary`}
        aria-label={s.status === 'speaking' ? 'Pause reading' : 'Resume reading'}
      >
        {s.status === 'speaking' ? <Pause size={compact ? 13 : 14} /> : <Play size={compact ? 13 : 14} />}
        {s.status === 'speaking' ? 'Pause' : 'Resume'}
      </button>
      <button type="button" onClick={() => stop(id)} className={`${btn} ${idle} ${compact ? 'h-8 w-8' : 'h-9 w-9'}`} aria-label="Stop reading">
        <Square size={compact ? 12 : 13} />
      </button>
      <button
        type="button"
        onClick={cycleRate}
        className={`${btn} ${idle} ${compact ? 'h-8 px-2 text-xs' : 'h-9 px-2.5'} font-mono tabular-nums`}
        aria-label={`Reading speed ${s.rate} times, tap to change`}
      >
        {s.rate}×
      </button>
      {/* Native select: on iPhone it opens the system wheel. Lists every
          English voice installed, best first, novelty voices left out. */}
      <label className="sr-only" htmlFor={`voice-${id}`}>Voice</label>
      <select
        id={`voice-${id}`}
        value={currentVoiceURI()}
        onChange={(e) => setVoice(e.target.value)}
        className={`${compact ? 'h-8 text-xs' : 'h-9 text-sm'} max-w-[11rem] truncate rounded-control border border-line-strong bg-surface-raised px-2 text-content-secondary focus:border-brand focus:outline-none`}
      >
        {listVoices().map((v) => <option key={v.voiceURI} value={v.voiceURI}>{voiceLabel(v)}</option>)}
      </select>
    </div>
  );
}

export default ListenButton;
