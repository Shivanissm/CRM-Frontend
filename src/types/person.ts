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
  categoryId?: number | null;
  categoryName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  // Legacy compatibility fields used across the UI
  organization?: string | null;
  manager?: string | null;
  category?: string | null; // Deprecated: use categoryName instead
  createdDate?: string | null;
}

export interface PersonSummary {
  person: Person;
  dealsCount: number;
}

export interface FilterMeta {
  categories: string[]; // Category names for display
  categoryOptions?: PersonCategory[]; // Full category objects with id and name
  organizations: string[]; // Organization names for display (legacy)
  organizationOptions?: Array<{ id: number; name: string; category?: string | null; ownerId?: number | null }>; // Full organization objects with id, name, category, and ownerId
  managers: string[];
  venues: string[];
  labelOptions?: PersonLabelOption[];
  sourceOptions?: PersonSourceOption[];
  ownerOptions?: PersonOwner[];
}

export interface PersonFilters {
  q?: string;
  label?: string | string[]; // Support both single and array
  source?: string;
  organizationId?: number | number[]; // Support both single and array
  ownerId?: number | number[]; // Support both single and array
  categoryId?: number | number[]; // Support both single and array
  leadFrom?: string;
  leadTo?: string;
  page?: number;
  size?: number;
  sort?: string;
  // Legacy keys used in existing filter UIs
  category?: string; // Deprecated: use categoryId instead
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

export interface PersonCategory {
  id: number;
  name: string;
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
  categoryId?: number | null; // Use categoryId instead of category
  source?: string | null;
  subSource?: string | null;
}

