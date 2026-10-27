import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TOPBAR_ACTIONS_ID, TopBarAction } from '../TopBar';

/**
 * The single page shell. Replaces the three that were in use (bordered title
 * card @1215px, bare h1 @full width, narrow 650px column).
 *
 * Page identity — title and description — lives in the TopBar, driven by
 * src/config/nav.js, so pages never render their own <h1>. This component owns
 * the vertical rhythm and the toolbar/actions row that sits above the content.
 * Gutters come from <main> in App.jsx; pages run full width.
 */
function Page({ toolbar, actions, actionsClassName = 'flex-shrink-0', primaryAction, children, className = '' }) {
  // `primaryAction` (one or a list of { label, icon, onClick, variant,
  // disabled, iconClassName }) renders in the top bar, where the dashboard's
  // New Trade sits — icon-only on phones. `actions` stays for page controls
  // that belong beside the content (view switches, column pickers, links).
  const [slot, setSlot] = useState(null);
  useEffect(() => { setSlot(document.getElementById(TOPBAR_ACTIONS_ID)); }, []);
  const primary = primaryAction ? [].concat(primaryAction).filter(Boolean) : [];

  return (
    <div className={`space-y-6 ${className}`}>
      {slot && primary.length > 0 && createPortal(
        primary.map((a, i) => <TopBarAction key={i} {...a} />),
        slot
      )}
      {(toolbar || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">{toolbar}</div>
          <div className={`flex flex-wrap items-center gap-2 ${actionsClassName}`}>{actions}</div>
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * A section heading that sits directly on the canvas — no card, no border.
 * This is what keeps surfaces from nesting three deep.
 */
export function PageSection({ title, description, actions, children, className = '' }) {
  return (
    <section className={`space-y-3 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-content-primary">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-content-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export default Page;
