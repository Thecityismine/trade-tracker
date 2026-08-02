/**
 * The surface system.
 *
 * Elevation is expressed as a background level plus a soft shadow — not as a
 * border. The rule that keeps the app from reading as nested rectangles:
 * never put a bordered surface inside another bordered surface. Borders are
 * reserved for genuinely interactive or stateful elements.
 *
 *   canvas   #0B0B0D  the page itself
 *   Card     #131316  a section of the page
 *   Panel    #17171B  something nested inside a Card
 */

/** Top-level section surface. Borderless, raised by shadow. */
export function Card({ children, className = '', padded = true, ...props }) {
  return (
    <div
      className={`rounded-card bg-surface shadow-elev-1 ${padded ? 'p-5' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/** Nested surface. Sits inside a Card — lighter fill, no border, no shadow. */
export function Panel({ children, className = '', padded = true, ...props }) {
  return (
    <div
      className={`rounded-control bg-surface-raised ${padded ? 'p-4' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * A single metric. Borderless: label, large tabular number, optional delta.
 * `tone` colours the value — green/red only ever mean P&L direction.
 */
export function StatTile({ label, value, hint, tone = 'neutral', className = '' }) {
  const toneClass = {
    neutral: 'text-content-primary',
    profit: 'text-profit',
    loss: 'text-loss',
    warn: 'text-warn',
    brand: 'text-brand',
  }[tone];

  return (
    <div className={`rounded-control bg-surface p-4 ${className}`}>
      <p className="text-xs text-content-secondary">{label}</p>
      <p className={`tabular mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-content-muted">{hint}</p>}
    </div>
  );
}

export default Card;
