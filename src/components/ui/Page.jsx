/**
 * The single page shell. Replaces the three that were in use (bordered title
 * card @1215px, bare h1 @full width, narrow 650px column).
 *
 * Page identity — title and description — lives in the TopBar, driven by
 * src/config/nav.js, so pages never render their own <h1>. This component owns
 * the vertical rhythm and the toolbar/actions row that sits above the content.
 * Max width and gutters come from <main> in App.jsx.
 */
function Page({ toolbar, actions, children, className = '' }) {
  return (
    <div className={`space-y-6 ${className}`}>
      {(toolbar || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">{toolbar}</div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
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
