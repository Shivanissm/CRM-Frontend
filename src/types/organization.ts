export interface OrganizationOwner {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  displayName: string;
}

export interface Organization {
  id: number;
  name: string;
  category?: string | null;
  owner?: OrganizationOwner | null;
  address?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OrganizationRequest {
  name: string;
  category: string;
  ownerId?: number | null;
  address?: string | null;
}

export interface OrganizationCategory {
  code: string;
  label: string;
}


