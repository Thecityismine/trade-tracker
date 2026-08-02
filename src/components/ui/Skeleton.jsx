/**
 * Loading placeholders matching the shape of the content that replaces them,
 * so nothing jumps when data lands.
 */
export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded-chip bg-surface-raised ${className}`} />;
}

/** Rows of text lines — for lists and feeds. */
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3.5 ${i === lines - 1 ? 'w-2/5' : i % 2 ? 'w-4/5' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/** A grid of stat tiles. */
export function SkeletonStats({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-control bg-surface p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2.5 h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A card with a heading and a block of body lines. */
export function SkeletonCard({ lines = 4, className = '' }) {
  return (
    <div className={`rounded-card bg-surface p-5 shadow-elev-1 ${className}`}>
      <Skeleton className="h-4 w-32" />
      <SkeletonText lines={lines} className="mt-4" />
    </div>
  );
}

export default Skeleton;
