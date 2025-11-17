import axios from 'axios';
import {
  type Deal,
  type DealCategory,
  type DealCreateRequest,
  type DealStageUpdateRequest,
  type DealStatus,
  type DealStatusUpdateRequest,
} from '../types/deal';
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
    if (error?.response?.status === 401) {
      console.warn('Unauthorized (401) when calling deals API. Logging out.');
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

const statusEndpointMap: Record<DealStatus, string> = {
  WON: '/won',
  LOST: '/lost',
  IN_PROGRESS: '/inprogress',
};

export const dealsApi = {
  list: async (): Promise<Deal[]> => {
    const response = await api.get('');
    return unwrap<Deal[]>(response.data);
  },

  listCategories: async (): Promise<DealCategory[]> => {
    const response = await api.get('/categories');
    return unwrap<DealCategory[]>(response.data);
  },

  listByStatus: async (status: DealStatus): Promise<Deal[]> => {
    const endpoint = statusEndpointMap[status];
    const response = await api.get(endpoint);
    return unwrap<Deal[]>(response.data);
  },

  get: async (id: number): Promise<Deal> => {
    const response = await api.get(`/${id}`);
    return unwrap<Deal>(response.data);
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

  remove: async (id: number): Promise<void> => {
    await api.delete(`/${id}`);
  },
};

