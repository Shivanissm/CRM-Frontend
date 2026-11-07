const INDIA_TIME_ZONE = 'Asia/Kolkata';

/** Saved deal times have no timezone. They are India wall-clock times. */
export function parseIndiaDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;

  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateTime = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (dateTime) {
    const [, year, month, day, hour, minute, second] = dateTime;
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second || '00'}+05:30`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const date = new Date(`${text}T00:00:00+05:30`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatIndiaDate(value?: string | null, empty = '—'): string {
  const date = parseIndiaDateTime(value);
  if (!date) return value?.trim() ? value : empty;
  return date.toLocaleDateString('en-US', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatIndiaDateTime(value?: string | null, empty = '—'): string {
  const date = parseIndiaDateTime(value);
  if (!date) return value?.trim() ? value : empty;
  return date.toLocaleString('en-US', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
