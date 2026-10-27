import Button from './Button';

/**
 * One empty state for the whole app: outline icon, headline, a line of context
 * and an optional primary action. No box — it sits directly on the canvas,
 * which is what stops empty screens reading as a grid of containers.
 */
function EmptyState({ icon: Icon, title, description, actionLabel, onAction, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center px-6 py-14 text-center ${className}`}>
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised">
          <Icon size={22} className="text-content-muted" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="text-base font-semibold text-content-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-content-secondary">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {/* For more than one action — pass the buttons themselves. */}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default EmptyState;
