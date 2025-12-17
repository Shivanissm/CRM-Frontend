import axios from 'axios';
import { getStoredToken, logoutAndRedirect } from '../utils/authToken';
import { withApiBase } from '../config/api';

// Custom params serializer to convert arrays to comma-separated strings
// Note: Backend may not support arrays, so we'll handle multiple values by making separate calls
const paramsSerializer = (params: Record<string, any>): string => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    // For arrays, only send the first value to avoid 400 errors
    // Multiple selections will be handled by making separate API calls
    if (Array.isArray(value)) {
      if (value.length > 0) {
        searchParams.append(key, String(value[0]));
      }
    } else {
      searchParams.append(key, String(value));
    }
  });
  return searchParams.toString();
};

const api = axios.create({
  baseURL: withApiBase('/api/activities'),
  headers: { 'Content-Type': 'application/json' },
  paramsSerializer,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    (config.headers = config.headers || {}).Authorization = `Bearer ${token}`;
  }
  // Debug logging for API requests
  if (config.params) {
    const fullUrl = config.baseURL + (config.url || '');
    console.log('[Activities API] Full Request URL:', fullUrl);
    console.log('[Activities API] Request URL (relative):', config.url || '(baseURL)');
    console.log('[Activities API] Base URL:', config.baseURL);
    console.log('[Activities API] Request Params:', config.params);
    if (config.params.serviceCategory || config.params.organizationCategory) {
      console.log('[Activities API] Service Category Filters:', {
        serviceCategory: config.params.serviceCategory,
        organizationCategory: config.params.organizationCategory
      });
    }
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
  (response) => {
    // Debug logging for successful responses
    if (response.config.params) {
      const isListRequest = !response.config.url || response.config.url === '';
      if (isListRequest) {
        console.log('[Activities API] List Response:', {
          url: response.config.baseURL + (response.config.url || ''),
          status: response.status,
          totalElements: response.data?.totalElements,
          contentLength: response.data?.content?.length || 0,
          hasServiceCategory: !!(response.config.params?.serviceCategory || response.config.params?.organizationCategory)
        });
      }
    }
    return response;
  },
  (error) => {
    if (error?.response?.status === 401 || error?.response?.status === 403) {
      console.warn(`Unauthorized (${error?.response?.status}) when calling activities API. Logging out.`);
      logoutAndRedirect();
    } else if (error?.response) {
      console.error('[Activities API] Error Response:', {
        url: error.config?.baseURL + (error.config?.url || ''),
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
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
  organizationId?: number | number[]; // Support both single and multiple organization IDs
  assignedUserId?: number | number[]; // Support both single and multiple assigned user IDs
  // Optional service category filter (e.g. PHOTOGRAPHY / MAKEUP / PLANNING_DECOR).
  // This is primarily used as a logical "service category" within the app.
  serviceCategory?: string;
  // Some activity endpoints use `organizationCategory` as the query‑param name
  // for the same concept. Keep this separate field so we can send BOTH
  // `serviceCategory` and `organizationCategory` when filtering, while still
  // remaining backwards compatible with older backends that only understand one
  // of them.
  organizationCategory?: string;
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

// Shape of the aggregated summary returned by GET /api/activities/summary.
// The exact field names come from the backend; keep everything optional so
// the UI can safely fall back to 0 if a field is missing.
export interface ActivitiesSummary {
  callAssignedCount?: number;
  callTakenCount?: number;
  meetingAssignedCount?: number;
  meetingDoneCount?: number;
  overdueCount?: number;
  callOverdueCount?: number;
  meetingOverdueCount?: number;
  activityTotalCount?: number;
  activityPendingCount?: number;
  activityCompletedCount?: number;
  totalCallDurationMinutes?: number;
}

export const activitiesApi = {
  // Accept an optional AbortSignal so callers can cancel in‑flight requests
  list: (params: ActivityFilters, options?: { signal?: AbortSignal }) =>
    api.get<PageResponse<Activity>>('', { params, signal: options?.signal }).then(r => r.data),
  // Aggregated counts for summary cards/badges.
  summary: (params: ActivityFilters, options?: { signal?: AbortSignal }) =>
    api.get<ActivitiesSummary>('/summary', { params, signal: options?.signal }).then(r => r.data),
  // Call-only summary
  summaryCall: (params: ActivityFilters, options?: { signal?: AbortSignal }) =>
    api.get<ActivitiesSummary>('/summary/call', { params, signal: options?.signal }).then(r => r.data),
  // Meeting-only summary
  summaryMeeting: (params: ActivityFilters, options?: { signal?: AbortSignal }) =>
    api.get<ActivitiesSummary>('/summary/meeting', { params, signal: options?.signal }).then(r => r.data),
  create: (activity: ActivityRequest) => api.post<Activity>('', activity).then(r => r.data),
  update: (id: number, activity: ActivityRequest) => api.put<Activity>(`/${id}`, activity).then(r => r.data),
  delete: (id: number) => api.delete(`/${id}`).then(() => {}),
  markDone: (id: number, value: boolean, durationMinutes?: number) => {
    const params: Record<string, any> = { value };
    if (durationMinutes !== undefined && durationMinutes !== null) {
      params.duration_minutes = durationMinutes;
    }
    return api.post<Activity>(`/${id}/done`, undefined, { params }).then(r => r.data);
  },
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


