import type { Deal, EventDateDetail } from '../types/deal';

/**
 * Gets all event dates from a deal, supporting both legacy (eventDate) and new (eventDates / eventDateDetails) formats.
 * Returns an array of date strings in ISO format (YYYY-MM-DD).
 */
export function getAllEventDates(deal: Deal | null | undefined): string[] {
  if (!deal) return [];
  
  // Prefer eventDateDetails if available
  if (deal.eventDateDetails && Array.isArray(deal.eventDateDetails) && deal.eventDateDetails.length > 0) {
    return deal.eventDateDetails
      .map((detail) => detail?.date)
      .filter((date): date is string => typeof date === 'string' && date.trim() !== '');
  }
  
  // Otherwise prefer eventDates if available
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
 * Gets normalized event date details from a deal, prioritizing eventDateDetails
 * and falling back to eventDates + eventType or eventDate + eventType.
 */
export function getEventDateDetailsFromDeal(deal: Deal | null | undefined): EventDateDetail[] {
  if (!deal) return [];

  if (Array.isArray(deal.eventDateDetails) && deal.eventDateDetails.length > 0) {
    return deal.eventDateDetails
      .filter((detail): detail is EventDateDetail => !!detail && typeof detail.date === 'string' && detail.date.trim() !== '');
  }

  const dates = deal.eventDates && Array.isArray(deal.eventDates) && deal.eventDates.length > 0
    ? deal.eventDates
    : (deal.eventDate ? [deal.eventDate] : []);

  return dates
    .filter((date): date is string => typeof date === 'string' && date.trim() !== '')
    .map((date) => ({
      date,
      eventType: deal.eventType || null,
    }));
}


