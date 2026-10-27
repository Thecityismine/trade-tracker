import { Menu, Plus } from 'lucide-react';

/** Where a page's primary actions render — see `primaryAction` on <Page>. */
export const TOPBAR_ACTIONS_ID = 'topbar-actions';

/**
 * A primary action in the top bar. Icon and label from `sm` up; icon only on
 * phones, so it never takes a row of its own.
 */
export function TopBarAction({ icon: Icon = Plus, label, onClick, disabled = false, variant = 'primary', iconClassName = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1.5 rounded-control px-3 py-2 text-sm font-medium transition-colors active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${
        variant === 'secondary'
          ? 'border border-line bg-surface-raised text-content-primary hover:bg-surface-hover'
          : 'bg-brand text-content-primary hover:bg-brand-hover'
      }`}
    >
      <Icon size={16} className={iconClassName} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * Slim contextual header. Holds the page identity and, on the right, the
 * page's primary actions: the dashboard's New Trade, or whatever a page passes
 * as `primaryAction`, rendered into the slot below.
 */
function TopBar({ title, description, onOpenMobileNav, onAddTrade, hintG }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8 2xl:px-10">
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

        <div id={TOPBAR_ACTIONS_ID} className="flex flex-shrink-0 items-center gap-2 empty:hidden" />

        {onAddTrade && <TopBarAction label="New Trade" onClick={onAddTrade} />}
      </div>
    </header>
  );
}

export default TopBar;
