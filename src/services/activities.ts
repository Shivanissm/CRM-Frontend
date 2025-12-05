import axios from 'axios';
import { getStoredToken, logoutAndRedirect } from '../utils/authToken';
import { withApiBase } from '../config/api';

const api = axios.create({
  baseURL: withApiBase('/api/activities'),
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    (config.headers = config.headers || {}).Authorization = `Bearer ${token}`;
  }
  // Debug logging for API requests
  if (config.params) {
    console.log('[Activities API] Request URL:', config.url);
    console.log('[Activities API] Request Params:', config.params);
    if (config.params.dateFrom || config.params.dateTo) {
      console.log('[Activities API] Date Filters:', {
        dateFrom: config.params.dateFrom,
        dateTo: config.params.dateTo,
        dateFromType: typeof config.params.dateFrom,
        dateToType: typeof config.params.dateTo
      });
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 || error?.response?.status === 403) {
      console.warn(`Unauthorized (${error?.response?.status}) when calling activities API. Logging out.`);
      logoutAndRedirect();
    }
    return Promise.reject(error);
  },
);

export type ActivityCategoryValue = string;
export type ActivityStatus = string;
export type ActivityPriority = string;
export type ActivityCallType = string;

export interface Activity {
  id: number;
  subject: string;
  category?: ActivityCategoryValue | null;
  type?: string | null;
  priority?: ActivityPriority | null;
  status?: ActivityStatus | null;
  assignedUser?: string | null;
  notes?: string | null;
  date?: string | null;
  dueDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  dateTime?: string | null;
  personId?: number | null;
  dealId?: number | null;
  dealName?: string | null;
  organization?: string | null;
  organizationId?: number | null;
  assignedUserId?: number | null;
  scheduleBy?: string | null;
  instagramId?: string | null;
  phone?: string | null;
  callType?: ActivityCallType | null;
  done: boolean;
  attachmentUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type ActivityRequest = Partial<Omit<Activity, 'id' | 'done' | 'createdAt' | 'updatedAt'>>;

export type PageResponse<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};

export interface ActivityFilters {
  personId?: number;
  organizationId?: number;
  assignedUserId?: number;
  dateFrom?: string;
  dateTo?: string;
  assignedUser?: string;
  category?: ActivityCategoryValue;
  status?: ActivityStatus;
  callType?: ActivityCallType;
  done?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

export const activitiesApi = {
  // Accept an optional AbortSignal so callers can cancel in‑flight requests
  list: (params: ActivityFilters, options?: { signal?: AbortSignal }) =>
    api.get<PageResponse<Activity>>('', { params, signal: options?.signal }).then(r => r.data),
  create: (activity: ActivityRequest) => api.post<Activity>('', activity).then(r => r.data),
  update: (id: number, activity: ActivityRequest) => api.put<Activity>(`/${id}`, activity).then(r => r.data),
  delete: (id: number) => api.delete(`/${id}`).then(() => {}),
  markDone: (id: number, value: boolean) =>
    api.post<Activity>(`/${id}/done`, undefined, { params: { value } }).then(r => r.data),
  uploadScreenshot: async (id: number, file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Create a separate axios instance for multipart/form-data
    const uploadApi = axios.create({
      baseURL: withApiBase('/api/activities'),
    });
    
    uploadApi.interceptors.request.use((config) => {
      const token = getStoredToken();
      if (token) {
        (config.headers = config.headers || {}).Authorization = `Bearer ${token}`;
      }
      // Don't set Content-Type for FormData - let browser set it with boundary
      return config;
    });
    
    uploadApi.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          console.warn(`Unauthorized (${error?.response?.status}) when calling activities API. Logging out.`);
          logoutAndRedirect();
        }
        return Promise.reject(error);
      },
    );
    
    const response = await uploadApi.post<{ success: boolean; message: string; data: string }>(
      `/${id}/upload-screenshot`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    throw new Error(response.data.message || 'Failed to upload screenshot');
  },
  listCategories: async () => {
    const response = await api.get('/categories');
    const payload = response.data;
    if (payload && Array.isArray(payload.data)) {
      return payload.data as Array<{ code: string; label: string }>;
    }
    if (Array.isArray(payload)) {
      return payload as Array<{ code: string; label: string }>;
    }
    return [];
  },
};


