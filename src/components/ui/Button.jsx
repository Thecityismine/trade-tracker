const VARIANTS = {
  primary: 'bg-brand text-content-primary hover:bg-brand-hover disabled:hover:bg-brand',
  secondary:
    'bg-surface-raised text-content-primary hover:bg-surface-hover border border-line',
  ghost: 'text-content-secondary hover:bg-surface-hover hover:text-content-primary',
  destructive: 'bg-loss/15 text-loss hover:bg-loss/25 border border-loss/30',
};

const SIZES = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-sm gap-2',
  lg: 'px-4 py-2.5 text-sm gap-2',
};

/** One button, four variants. Replaces the ad-hoc blue buttons across the app. */
function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  children,
  className = '',
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-control font-medium transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

/**
 * Selectable chip: outline by default, filled when selected — so a set of
 * unselected options doesn't read as "everything is already on".
 */
export function Chip({ selected, children, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`rounded-chip px-3 py-1.5 text-xs font-medium transition-colors ${
        selected
          ? 'bg-brand text-content-primary'
          : 'border border-line-strong text-content-secondary hover:border-brand/50 hover:text-content-primary'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
