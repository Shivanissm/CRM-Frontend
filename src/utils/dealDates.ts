import type { Deal } from '../types/deal';

/**
 * Gets all event dates from a deal, supporting both legacy (eventDate) and new (eventDates) formats.
 * Returns an array of date strings in ISO format (YYYY-MM-DD).
 */
export function getAllEventDates(deal: Deal | null | undefined): string[] {
  if (!deal) return [];
  
  // Prefer eventDates if available
  if (deal.eventDates && Array.isArray(deal.eventDates) && deal.eventDates.length > 0) {
    return deal.eventDates.filter((date): date is string => typeof date === 'string' && date.trim() !== '');
  }
  
  // Fall back to legacy eventDate
  if (deal.eventDate) {
    return [deal.eventDate];
  }
  
  return [];
}

/**
 * Gets the first event date from a deal for backward compatibility.
 * Used for sorting and display when only one date is needed.
 */
export function getFirstEventDate(deal: Deal | null | undefined): string | null {
  const dates = getAllEventDates(deal);
  return dates.length > 0 ? dates[0] : null;
}

/**
 * Converts a single eventDate to eventDates array format.
 * Used when migrating from legacy format to new format.
 */
export function eventDateToEventDates(eventDate: string | null | undefined): string[] {
  if (!eventDate) return [];
  return [eventDate];
}

/**
 * Converts eventDates array to a single eventDate (first date).
 * Used for backward compatibility when only one date is needed.
 */
export function eventDatesToEventDate(eventDates: string[] | null | undefined): string | null {
  if (!eventDates || eventDates.length === 0) return null;
  return eventDates[0] || null;
}

/**
 * Normalizes event dates for API requests.
 * If eventDates is provided, it takes precedence.
 * If only eventDate is provided, it converts to eventDates format.
 * Returns an object with eventDates (and optionally eventDate for backward compatibility).
 */
export function normalizeEventDatesForRequest(
  eventDate?: string | null,
  eventDates?: string[] | null
): { eventDates?: string[] | null; eventDate?: string | null } {
  // If eventDates is provided and not empty, use it
  if (eventDates && Array.isArray(eventDates) && eventDates.length > 0) {
    const validDates = eventDates.filter((date): date is string => typeof date === 'string' && date.trim() !== '');
    if (validDates.length > 0) {
      return {
        eventDates: validDates,
        // Also include first date as eventDate for backward compatibility
        eventDate: validDates[0],
      };
    }
  }
  
  // If only eventDate is provided, convert to eventDates
  if (eventDate) {
    return {
      eventDates: [eventDate],
      eventDate: eventDate,
    };
  }
  
  // No dates provided
  return {
    eventDates: null,
    eventDate: null,
  };
}


