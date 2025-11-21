import axios from 'axios';
import { withApiBase } from '../config/api';
import { getStoredToken, logoutAndRedirect } from '../utils/authToken';
import type { VendorCalendarEvent, VendorCalendarEventFilters } from '../types/calendar';

const api = axios.create({
  baseURL: withApiBase('/api/calendar'),
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
      console.warn('Unauthorized (401) when calling calendar API. Logging out.');
      logoutAndRedirect();
    }
    return Promise.reject(error);
  },
);

const unwrap = <T,>(payload: any): T => {
  if (payload && typeof payload === 'object') {
    if ('data' in payload && payload.data !== undefined) {
      return payload.data as T;
    }
    if ('success' in payload && 'data' in payload) {
      return payload.data as T;
    }
  }
  return payload as T;
};

export const calendarApi = {
  listVendorEvents: async (filters: VendorCalendarEventFilters = {}): Promise<VendorCalendarEvent[]> => {
    const response = await api.get('/vendor-events', {
      params: {
        organizationId: filters.organizationId,
        from: filters.from,
        to: filters.to,
      },
    });
    return unwrap<VendorCalendarEvent[]>(response.data);
  },
};



