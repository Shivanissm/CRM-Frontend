export interface Person {
  id: number;
  name: string;
  organizationId?: number | null;
  organizationName?: string | null;
  ownerId?: number | null;
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
  phone?: string | null;
  email?: string | null;
  instagramId?: string | null;
  leadDate?: string | null;
  label?: string | null;
  source?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  // Legacy compatibility fields used across the UI
  organization?: string | null;
  manager?: string | null;
  category?: string | null;
  createdDate?: string | null;
}

export interface PersonSummary {
  person: Person;
  dealsCount: number;
}

export interface FilterMeta {
  categories: string[];
  organizations: string[];
  managers: string[];
  venues: string[];
  labelOptions?: PersonLabelOption[];
  sourceOptions?: PersonSourceOption[];
  ownerOptions?: PersonOwner[];
}

export interface PersonFilters {
  q?: string;
  label?: string;
  source?: string;
  organizationId?: number;
  ownerId?: number;
  leadFrom?: string;
  leadTo?: string;
  page?: number;
  size?: number;
  sort?: string;
  // Legacy keys used in existing filter UIs
  category?: string;
  organization?: string;
  manager?: string;
  dateFrom?: string;
  dateTo?: string;
  weddingVenue?: string;
  weddingDate?: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface PersonFilterCondition {
  field: string;
  operator: string;
  value: string;
}

export interface SavedPersonFilter {
  name: string;
  conditions: PersonFilterCondition[];
}

export interface PersonOwner {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  displayName: string;
}

export interface PersonLabelOption {
  code: string;
  label: string;
}

export interface PersonSourceOption {
  code: string;
  label: string;
}

export interface PersonRequest {
  name: string;
  organizationId?: number | null;
  ownerId?: number | null;
  phone?: string | null; // Can be string, null, or empty string to clear
  email?: string | null;
  instagramId?: string | null;
  leadDate?: string | null;
  label?: string | null;
  source?: string | null;
  subSource?: string | null;
}

