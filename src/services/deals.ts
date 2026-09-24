import axios from 'axios';
import {
  type Deal,
  type DealCategory,
  type DealCreateRequest,
  type DealStageUpdateRequest,
  type DealStatus,
  type DealStatusUpdateRequest,
  type DealUpdateRequest,
} from '../types/deal';
import type { Pipeline } from '../types/pipeline';
import { getStoredToken, logoutAndRedirect } from '../utils/authToken';
import { withApiBase } from '../config/api';

const api = axios.create({
  baseURL: withApiBase('/api/deals'),
  headers: {
    'Content-Type': 'application/json',
  },
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
      console.warn(`Unauthorized (${error?.response?.status}) when calling deals API. Logging out.`);
      logoutAndRedirect();
    }
    return Promise.reject(error);
  },
);

const unwrap = <T,>(payload: any): T => {
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
};

const normalizeDealList = (payload: unknown): Deal[] => {
  const unwrapped = unwrap<unknown>(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }

  if (unwrapped && typeof unwrapped === 'object') {
    const record = unwrapped as Record<string, unknown>;

    if (Array.isArray(record.content)) {
      return record.content as Deal[];
    }

    if (Array.isArray(record.data)) {
      return record.data as Deal[];
    }

    if (record.data && typeof record.data === 'object') {
      const nested = record.data as Record<string, unknown>;
      if (Array.isArray(nested.content)) {
        return nested.content as Deal[];
      }
    }
  }

  return [];
};

const statusEndpointMap: Record<DealStatus, string> = {
  WON: '/won',
  LOST: '/lost',
  IN_PROGRESS: '/inprogress',
};

export type DealSortField = 
  | 'nextActivity'
  | 'name'
  | 'value'
  | 'personName'
  | 'organizationName'
  | 'eventDate'
  | 'createdAt'
  | 'updatedAt'
  | 'completedActivitiesCount'
  | 'pendingActivitiesCount'
  | 'productsCount'
  | 'ownerName';

export type SortDirection = 'asc' | 'desc';

export interface DealListParams {
  sort?: DealSortField;
  direction?: SortDirection;
  pipelineId?: number;
  status?: DealStatus | 'all';
  organizationId?: number;
  categoryId?: number;
  managerId?: number;
  dateFrom?: string; // YYYY-MM-DD format
  dateTo?: string; // YYYY-MM-DD format
  search?: string;
}

export const dealsApi = {
  list: async (params?: DealListParams): Promise<Deal[]> => {
    const queryParams: Record<string, string> = {};
    if (params?.sort) {
      queryParams.sort = `${params.sort},${params.direction || 'asc'}`;
    }
    if (params?.pipelineId !== undefined) {
      queryParams.pipelineId = String(params.pipelineId);
    }
    if (params?.status && params.status !== 'all') {
      queryParams.status = params.status;
    }
    if (params?.organizationId !== undefined) {
      queryParams.organizationId = String(params.organizationId);
    }
    if (params?.categoryId !== undefined) {
      queryParams.categoryId = String(params.categoryId);
    }
    if (params?.managerId !== undefined) {
      queryParams.managerId = String(params.managerId);
    }
    if (params?.dateFrom) {
      queryParams.dateFrom = params.dateFrom;
    }
    if (params?.dateTo) {
      queryParams.dateTo = params.dateTo;
    }
    if (params?.search) {
      queryParams.search = params.search;
    }
    const response = await api.get('', { params: queryParams });
    return normalizeDealList(response.data);
  },

  listCategories: async (): Promise<DealCategory[]> => {
    const response = await api.get('/categories');
    return unwrap<DealCategory[]>(response.data);
  },

  listByStatus: async (status: DealStatus): Promise<Deal[]> => {
    const endpoint = statusEndpointMap[status];
    const response = await api.get(endpoint);
    return normalizeDealList(response.data);
  },

  get: async (id: number): Promise<Deal> => {
    const response = await api.get(`/${id}`);
    const payload = unwrap<any>(response.data);
    // The detail endpoint returns { deal, persons, activities }; unwrap the nested deal.
    if (payload && typeof payload === 'object' && 'deal' in payload && payload.deal) {
      return payload.deal as Deal;
    }
    return payload as Deal;
  },

  create: async (payload: DealCreateRequest): Promise<Deal> => {
    const response = await api.post('', payload);
    return unwrap<Deal>(response.data);
  },

  moveToStage: async (id: number, request: DealStageUpdateRequest): Promise<Deal> => {
    const response = await api.put(`/${id}/stage`, request);
    return unwrap<Deal>(response.data);
  },

  updateStatus: async (id: number, request: DealStatusUpdateRequest): Promise<Deal> => {
    const response = await api.patch(`/${id}/status`, request);
    return unwrap<Deal>(response.data);
  },

  update: async (id: number, payload: DealUpdateRequest): Promise<Deal> => {
    const response = await api.patch(`/${id}`, payload);
    return unwrap<Deal>(response.data);
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/${id}`);
  },

  getAvailablePipelines: async (dealId: number): Promise<Pipeline[]> => {
    const response = await api.get(`/${dealId}/available-pipelines`);
    return unwrap<Pipeline[]>(response.data);
  },

  listSources: async (): Promise<Array<{ code: string; label: string }>> => {
    const response = await api.get('/sources');
    return unwrap<Array<{ code: string; label: string }>>(response.data);
  },

  listSubSources: async (): Promise<Array<{ code: string; label: string }>> => {
    const response = await api.get('/sub-sources');
    return unwrap<Array<{ code: string; label: string }>>(response.data);
  },

  getStageDurations: async (dealId: number): Promise<Record<number, number>> => {
    const response = await api.get(`/${dealId}/stage-durations`);
    return unwrap<Record<number, number>>(response.data);
  },

  getCurrentStageDuration: async (dealId: number): Promise<number> => {
    const response = await api.get(`/${dealId}/current-stage-duration`);
    return unwrap<number>(response.data);
  },
};

