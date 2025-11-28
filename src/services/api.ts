import axios from 'axios';
import {
  type Person,
  type PersonSummary,
  type PersonFilters,
  type PageResponse,
  type PersonFilterCondition,
  type SavedPersonFilter,
  type PersonOwner,
  type PersonLabelOption,
  type PersonSourceOption,
  type PersonRequest,
  type FilterMeta,
} from '../types/person';
import { getStoredToken, logoutAndRedirect } from '../utils/authToken';
import { withApiBase } from '../config/api';

const api = axios.create({
  baseURL: withApiBase('/api/persons'),
  headers: {
    'Content-Type': 'application/json',
  },
  paramsSerializer: {
    indexes: null,
  },
});

type RawPerson = Person & {
  organizationName?: string | null;
  ownerDisplayName?: string | null;
  leadDate?: string | null;
  label?: string | null;
  source?: string | null;
};

const normalizePerson = (raw: RawPerson): Person => ({
  ...raw,
  organization: raw.organizationName ?? raw.organization ?? null,
  manager: raw.ownerDisplayName ?? raw.manager ?? null,
  category: raw.label ?? raw.category ?? null,
  createdDate: raw.leadDate ?? raw.createdDate ?? null,
  source: raw.source ?? null,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    (config.headers = config.headers || {}).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 || error?.response?.status === 403) {
      console.warn(`Unauthorized (${error?.response?.status}) when calling persons API. Logging out.`);
      logoutAndRedirect();
    }
    return Promise.reject(error);
  },
);

const buildParams = (filters: PersonFilters = {}): Record<string, string> => {
  const params: Record<string, string> = {};
  if (filters.q) params.q = filters.q;
  const label = filters.label || filters.category;
  if (label) params.label = label;
  if (filters.source) params.source = filters.source;
  if (filters.organizationId) params.organizationId = filters.organizationId.toString();
  if (filters.ownerId) params.ownerId = filters.ownerId.toString();
  const leadFrom = filters.leadFrom || (filters as any).dateFrom;
  const leadTo = filters.leadTo || (filters as any).dateTo;
  if (leadFrom) params.leadFrom = leadFrom;
  if (leadTo) params.leadTo = leadTo;
  if (filters.page !== undefined) params.page = filters.page.toString();
  if (filters.size !== undefined) params.size = filters.size.toString();
  if (filters.sort) params.sort = filters.sort;
  return params;
};

const normalizePage = (response: PageResponse<RawPerson>): PageResponse<Person> => ({
  ...response,
  content: response.content.map(normalizePerson),
});

export const personsApi = {
  list: async (filters: PersonFilters = {}): Promise<PageResponse<Person>> => {
    const response = await api.get<PageResponse<RawPerson>>('', { params: buildParams(filters) });
    return normalizePage(response.data);
  },

  get: async (id: number): Promise<Person> => {
    const response = await api.get<RawPerson>(`/${id}`);
    return normalizePerson(response.data);
  },

  getSummary: async (id: number): Promise<PersonSummary> => {
    const response = await api.get<PersonSummary>(`/${id}/summary`);
    return {
      ...response.data,
      person: normalizePerson(response.data.person as RawPerson),
    } as PersonSummary;
  },

  create: async (payload: PersonRequest): Promise<Person> => {
    const response = await api.post<RawPerson>('', payload);
    return normalizePerson(response.data);
  },

  update: async (id: number, payload: Partial<PersonRequest>): Promise<Person> => {
    const response = await api.put<RawPerson>(`/${id}`, payload);
    return normalizePerson(response.data);
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/${id}`);
  },

  bulkDelete: async (ids: number[]): Promise<number> => {
    // Backend expects comma-separated IDs: ?ids=1,2,3
    const idsParam = ids.join(',');
    const response = await api.delete<number>('', { params: { ids: idsParam } });
    return response.data;
  },

  merge: async (targetId: number, duplicateIds: number[]): Promise<Person> => {
    const response = await api.post<RawPerson>(`/${targetId}/merge`, { duplicateIds });
    return normalizePerson(response.data);
  },

  getFilters: async (): Promise<FilterMeta> => {
    const [labelsResp, sourcesResp, ownersResp] = await Promise.all([
      api.get<PersonLabelOption[]>('/labels'),
      api.get<PersonSourceOption[]>('/sources'),
      api.get<PersonOwner[]>('/owners'),
    ]);

    return {
      categories: labelsResp.data.map((option) => option.code),
      organizations: [],
      managers: ownersResp.data.map((owner) => owner.displayName || owner.email),
      venues: [],
      labelOptions: labelsResp.data,
      sourceOptions: sourcesResp.data,
      ownerOptions: ownersResp.data,
    };
  },

  listCustomFilters: async (): Promise<SavedPersonFilter[]> => {
    const response = await api.get<Record<string, PersonFilterCondition[]>>('/custom-filters');
    const map = response.data || {};
    return Object.entries(map).map(([name, conditions]) => ({ name, conditions: conditions ?? [] }));
  },

  saveCustomFilter: async (name: string, conditions: PersonFilterCondition[]): Promise<void> => {
    await api.post<void>('/custom-filters', { name, conditions });
  },

  deleteCustomFilter: async (name: string): Promise<void> => {
    await api.delete<void>(`/custom-filters/${encodeURIComponent(name)}`);
  },

  applyCustomFilter: async (
    conditions: PersonFilterCondition[],
    pagination: Pick<PersonFilters, 'page' | 'size' | 'sort'> = {},
  ): Promise<PageResponse<Person>> => {
    const response = await api.post<PageResponse<RawPerson>>(
      '/apply-filter',
      { conditions },
      { params: buildParams(pagination) },
    );
    return normalizePage(response.data);
  },

  listOwners: async (): Promise<PersonOwner[]> => {
    const response = await api.get<PersonOwner[]>('/owners');
    return response.data;
  },

  listLabels: async (): Promise<PersonLabelOption[]> => {
    const response = await api.get<PersonLabelOption[]>('/labels');
    return response.data;
  },

  listSources: async (): Promise<PersonSourceOption[]> => {
    const response = await api.get<PersonSourceOption[]>('/sources');
    return response.data;
  },
};
