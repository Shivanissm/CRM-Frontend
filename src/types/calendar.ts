export interface VendorCalendarEvent {
  id: number;
  organizationId: number;
  organizationName: string;
  googleEventId: string;
  summary: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  status?: string | null;
  lastSyncedAt?: string | null;
}

export interface VendorCalendarEventFilters {
  organizationId?: number;
  from?: string;
  to?: string;
}



