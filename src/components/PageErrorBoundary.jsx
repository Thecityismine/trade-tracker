import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Catches failures inside the lazily-loaded page area.
 *
 * The case this exists for: a deploy replaces the hashed chunk filenames, a tab
 * still holding the old index.html tries to import one, and the dynamic import
 * rejects. Without a boundary that failure is swallowed — the shell keeps
 * rendering and the whole page area just goes blank, which reads as "my data
 * disappeared" rather than "reload me".
 *
 * A chunk-load failure is self-healing, so offer the reload directly.
 */
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page failed to render:', error, info);
  }

  componentDidUpdate(prevProps) {
    // Navigating away from a broken page should clear the error.
    if (prevProps.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isStaleChunk =
      /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
        error?.message || ''
      );

    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warn-soft">
          <AlertTriangle size={22} className="text-warn" strokeWidth={1.5} />
        </div>
        <h2 className="text-base font-semibold text-content-primary">
          {isStaleChunk ? 'A new version is available' : 'This page failed to load'}
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-content-secondary">
          {isStaleChunk
            ? 'The app was updated while this tab was open, so part of it could not be fetched. Reloading picks up the new version — your data is safe.'
            : 'Something went wrong rendering this page. Reloading usually clears it.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex items-center gap-2 rounded-control bg-brand px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover active:scale-95"
        >
          <RefreshCw size={15} />
          Reload
        </button>
        {!isStaleChunk && (
          <pre className="mt-5 max-w-full overflow-x-auto rounded-control bg-surface-raised px-3 py-2 text-left text-xs text-content-muted">
            {String(error?.message || error)}
          </pre>
        )}
      </div>
    );
  }
}

export default PageErrorBoundary;
