export type DealStatus = 'IN_PROGRESS' | 'WON' | 'LOST';

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
  phoneNumber?: string | null;
  finalThankYouSent?: boolean | null;
  eventDateAsked?: boolean | null;
  contactNumberAsked?: boolean | null;
  venueAsked?: boolean | null;
  eventDate?: string | null;
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
  finalThankYouSent?: boolean | null;
  eventDateAsked?: boolean | null;
  contactNumberAsked?: boolean | null;
  venueAsked?: boolean | null;
  eventDate?: string | null;
}

export interface DealStageUpdateRequest {
  stageId: number;
}

export interface DealStatusUpdateRequest {
  status: DealStatus;
}

export interface DealCategory {
  id: string;
  label: string;
}

