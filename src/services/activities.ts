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
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      console.warn('Unauthorized (401) when calling activities API. Logging out.');
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
  scheduleBy?: string | null;
  instagramId?: string | null;
  phone?: string | null;
  callType?: ActivityCallType | null;
  done: boolean;
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
  list: (params: ActivityFilters) => api.get<PageResponse<Activity>>('', { params }).then(r => r.data),
  create: (activity: ActivityRequest) => api.post<Activity>('', activity).then(r => r.data),
  update: (id: number, activity: ActivityRequest) => api.put<Activity>(`/${id}`, activity).then(r => r.data),
  delete: (id: number) => api.delete(`/${id}`).then(() => {}),
  markDone: (id: number, value: boolean) =>
    api.post<Activity>(`/${id}/done`, undefined, { params: { value } }).then(r => r.data),
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


