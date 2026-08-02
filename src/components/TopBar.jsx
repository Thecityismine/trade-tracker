import { Menu, Plus } from 'lucide-react';

/**
 * Slim contextual header. Holds the page identity and the app's primary action —
 * replaces the old overflowing tab strip.
 */
function TopBar({ title, description, onOpenMobileNav, onAddTrade, hintG }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-5 lg:px-8">
        <button
          onClick={onOpenMobileNav}
          className="-ml-1 rounded-control p-2 text-content-secondary hover:bg-surface-hover hover:text-content-primary lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-content-primary">{title}</h2>
          {description && (
            <p className="hidden truncate text-xs text-content-muted sm:block">{description}</p>
          )}
        </div>

        {hintG && (
          <span className="hidden rounded-chip bg-surface-raised px-2 py-1 text-[11px] text-content-secondary sm:inline">
            g …
          </span>
        )}

        <button
          onClick={onAddTrade}
          className="flex items-center gap-1.5 rounded-control bg-brand px-3 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-brand-hover active:scale-95"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">New Trade</span>
        </button>
      </div>
    </header>
  );
}

export default TopBar;
