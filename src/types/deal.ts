export type DealStatus = 'IN_PROGRESS' | 'WON' | 'LOST';

export type DealSource = 'Direct' | 'Divert' | 'Reference' | 'Planner';

export type DealSubSource = 'Instagram' | 'Whatsapp' | 'Landing Page' | 'Email';

export interface Deal {
  id: number;
  name: string;
  value: number;
  personId?: number | null;
  pipelineId?: number | null;
  stageId?: number | null;
  sourceId?: number | null;
  organizationId?: number | null;
  categoryId?: number | string | null;
  eventType?: string | null;
  status: DealStatus;
  commissionAmount?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  venue?: string | null;
  googleCalendarEventId?: string | null;
  googleCalendarEventIds?: Record<string, string> | null;
  phoneNumber?: string | null;
  email?: string | null;
  finalThankYouSent?: boolean | null;
  eventDateAsked?: boolean | null;
  contactNumberAsked?: boolean | null;
  venueAsked?: boolean | null;
  eventDate?: string | null;
  eventDates?: string[] | null;
  label?: string | null;
  source?: DealSource | null;
  subSource?: DealSubSource | null;
  isDiverted?: boolean | null;
  referencedDealId?: number | null;
  referencedPipelineId?: number | null;
  lostReason?: string | null;
  ownerId?: number | null;
  createdBy?: 'USER' | 'BOT' | null;
  createdByUserId?: number | null;
  createdByName?: string | null;
}

export interface DealCreateRequest {
  name: string;
  value?: number | null;
  personId?: number | null;
  pipelineId?: number | null;
  stageId?: number | null;
  sourceId?: number | null;
  organizationId?: number | null;
  categoryId?: number | string | null;
  eventType?: string | null;
  status?: DealStatus;
  commissionAmount?: number | null;
  venue?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  finalThankYouSent?: boolean | null;
  eventDateAsked?: boolean | null;
  contactNumberAsked?: boolean | null;
  venueAsked?: boolean | null;
  eventDate?: string | null;
  eventDates?: string[] | null;
  label?: string | null;
  source?: DealSource | null;
  subSource?: DealSubSource | null;
  referencedDealId?: number | null;
  ownerId?: number | null;
  createdBy?: 'USER' | 'BOT' | null;
  createdByUserId?: number | null;
}

export interface DealStageUpdateRequest {
  stageId: number;
}

export interface DealStatusUpdateRequest {
  status: DealStatus;
  lostReason?: string | null;
}

export interface DealUpdateRequest {
  name?: string;
  value?: number | null;
  personId?: number | null;
  pipelineId?: number | null;
  stageId?: number | null;
  sourceId?: number | null;
  organizationId?: number | null;
  categoryId?: number | string | null;
  eventType?: string | null;
  status?: DealStatus;
  commissionAmount?: number | null;
  venue?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  finalThankYouSent?: boolean | null;
  eventDateAsked?: boolean | null;
  contactNumberAsked?: boolean | null;
  venueAsked?: boolean | null;
  eventDate?: string | null;
  eventDates?: string[] | null;
  label?: string | null;
  source?: DealSource | null;
  subSource?: DealSubSource | null;
  ownerId?: number | null;
}

export interface DealCategory {
  id: string;
  label: string;
}

