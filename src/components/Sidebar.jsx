import { signOut } from 'firebase/auth';
import { ChevronsLeft, ChevronsRight, LogOut, X } from 'lucide-react';
import { auth } from '../config/firebase';
import { NAV_GROUPS } from '../config/nav';

function NavButton({ item, isActive, collapsed, onSelect }) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => onSelect(item.id)}
      title={collapsed ? `${item.label}  ·  g ${item.key}` : `g ${item.key}`}
      aria-current={isActive ? 'page' : undefined}
      className={`group relative flex w-full items-center gap-3 rounded-control py-2 text-sm transition-colors ${
        collapsed ? 'justify-center px-0' : 'px-3'
      } ${
        isActive
          ? 'bg-brand-muted font-medium text-content-primary'
          : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
      }`}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
      )}
      <Icon size={18} className={isActive ? 'text-brand' : ''} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && (
        <span className="ml-auto hidden text-[11px] text-content-muted group-hover:inline">
          {item.key}
        </span>
      )}
    </button>
  );
}

/**
 * Primary navigation. 240px expanded, 64px icon rail collapsed (persisted by App),
 * and an overlay drawer below the lg breakpoint.
 */
function Sidebar({ activeId, onSelect, collapsed, onToggleCollapse, mobileOpen, onCloseMobile }) {
  const handleSelect = (id) => {
    onSelect(id);
    onCloseMobile?.();
  };

  const content = (isRail) => (
    <div className="flex h-full flex-col bg-surface">
      {/* Wordmark */}
      <div
        className={`flex h-16 shrink-0 items-center ${isRail ? 'justify-center px-0' : 'justify-between px-4'}`}
      >
        {isRail ? (
          <span className="text-lg font-bold">
            <span className="text-brand">T</span>
            <span className="text-loss">T</span>
          </span>
        ) : (
          <>
            <h1 className="text-lg font-bold tracking-tight text-content-primary">
              <span className="text-brand">T</span>rade <span className="text-loss">T</span>racker
            </h1>
            <button
              onClick={onCloseMobile}
              className="rounded-control p-1 text-content-muted hover:text-content-primary lg:hidden"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </>
        )}
      </div>

      {/* Groups */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            {isRail ? (
              <div className="mx-auto mb-2 h-px w-6 bg-line" />
            ) : (
              <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-content-muted">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                isActive={activeId === item.id}
                collapsed={isRail}
                onSelect={handleSelect}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={`shrink-0 space-y-1 border-t border-line py-3 ${isRail ? 'px-2' : 'px-3'}`}>
        <button
          onClick={() => signOut(auth)}
          title="Sign out"
          className={`flex w-full items-center gap-3 rounded-control py-2 text-sm text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary ${
            isRail ? 'justify-center px-0' : 'px-3'
          }`}
        >
          <LogOut size={18} />
          {!isRail && <span>Sign out</span>}
        </button>
        <button
          onClick={onToggleCollapse}
          title="Toggle sidebar  ·  ["
          className={`hidden w-full items-center gap-3 rounded-control py-2 text-sm text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary lg:flex ${
            isRail ? 'justify-center px-0' : 'px-3'
          }`}
        >
          {isRail ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          {!isRail && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-line transition-[width] duration-200 lg:block ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {content(collapsed)}
      </aside>

      {/* Mobile drawer */}
      <div className={`lg:hidden ${mobileOpen ? '' : 'pointer-events-none'}`}>
        <div
          onClick={onCloseMobile}
          className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-line shadow-elev-3 transition-transform duration-200 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {content(false)}
        </aside>
      </div>
    </>
  );
}

export default Sidebar;
