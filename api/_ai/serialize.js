export const SOURCE_APP = 'btc-trade-tracker';

/**
 * Firestore Timestamps JSON-stringify to {_seconds, _nanoseconds}, which a
 * model has to decode arithmetically before it can reason about a date. Every
 * date leaving this API is an ISO 8601 string instead.
 */
export function toIso(value) {
  if (value === null || value === undefined) return null;

  const date =
    typeof value?.toDate === 'function' ? value.toDate()
    : value instanceof Date ? value
    : typeof value === 'number' ? new Date(value)
    : typeof value === 'string' ? new Date(value)
    : null;

  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

/**
 * Number(null) and Number('') are both 0, which would turn "no exit price yet"
 * into a real break-even figure. Absent stays absent.
 */
export function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function round(value, places = 2) {
  const parsed = num(value);
  return parsed === null ? null : Number(parsed.toFixed(places));
}

export function text(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function list(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

/** Collapses markdown/whitespace into a one-line plain-text preview. */
export function preview(value, maxLength = 280) {
  const raw = text(value);
  if (!raw) return null;

  const flat = raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!flat) return null;
  return flat.length <= maxLength ? flat : `${flat.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Drops keys that carry no information. A record full of nulls costs the model
 * tokens and invites it to report "unknown" for fields that simply do not apply
 * to that record type.
 */
export function compact(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      return true;
    })
  );
}

/**
 * Recursively converts anything Firestore hands back — Timestamps, nested maps,
 * arrays — into plain JSON. Used for the raw passthrough on generic collection
 * reads, where no hand-written mapper knows the shape.
 */
export function plain(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value?.toDate === 'function') return toIso(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return depth > 6 ? [] : value.map((item) => plain(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth > 6) return {};
    // Firestore GeoPoint/DocumentReference and similar carry no useful JSON form.
    if (typeof value.path === 'string' && typeof value.id === 'string') return value.path;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item, depth + 1)]));
  }
  return value;
}
