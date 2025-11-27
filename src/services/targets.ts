import axios from 'axios';
import {
  type DashboardResponse,
  type FiltersResponse,
  type TargetResponse,
  type TargetUpsertRequest,
  type SalesUserWithOrganizations,
  type SalesUserOrganizationsResponse,
  type TargetCategory,
  type TimePreset,
  type UserTargetDetailResponse,
  type CategoryMonthlyBreakdownResponse,
} from '../types/target';
import { getStoredToken, logoutAndRedirect } from '../utils/authToken';
import { withApiBase } from '../config/api';

const api = axios.create({
  baseURL: withApiBase('/api/targets'),
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
      console.warn('Unauthorized (401) when calling targets API. Logging out.');
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

interface DashboardParams {
  category?: TargetCategory;
  timePreset?: TimePreset;
  month?: number;
  year?: number;
  fromMonth?: number;
  fromYear?: number;
  toMonth?: number;
  toYear?: number;
}

interface ListTargetsParams {
  month?: number;
  year?: number;
  category?: TargetCategory;
}

interface CategoryBreakdownParams extends DashboardParams {
  category: TargetCategory;
}

export const targetsApi = {
  getDashboard: async (params?: DashboardParams): Promise<DashboardResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.timePreset) queryParams.append('timePreset', params.timePreset);
    if (params?.month) queryParams.append('month', params.month.toString());
    if (params?.year) queryParams.append('year', params.year.toString());
    if (params?.fromMonth) queryParams.append('fromMonth', params.fromMonth.toString());
    if (params?.fromYear) queryParams.append('fromYear', params.fromYear.toString());
    if (params?.toMonth) queryParams.append('toMonth', params.toMonth.toString());
    if (params?.toYear) queryParams.append('toYear', params.toYear.toString());

    const url = `/dashboard${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await api.get(url);
    const data = unwrap<DashboardResponse>(response.data);
    // Ensure the response has the expected structure
    if (!data.months) data.months = [];
    if (!data.deals) data.deals = [];
    if (!data.filters) data.filters = { editableForCurrentUser: false };
    return data;
  },

  getFilters: async (): Promise<FiltersResponse> => {
    const response = await api.get('/filters');
    const data = unwrap<FiltersResponse>(response.data);
    // Ensure the response has the expected structure
    if (!data.categories) data.categories = [];
    if (!data.presets) data.presets = [];
    if (!data.minYear) data.minYear = new Date().getFullYear();
    return data;
  },

  list: async (params?: ListTargetsParams): Promise<TargetResponse[]> => {
    const queryParams = new URLSearchParams();
    if (params?.month) queryParams.append('month', params.month.toString());
    if (params?.year) queryParams.append('year', params.year.toString());
    if (params?.category) queryParams.append('category', params.category);

    const url = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const response = await api.get(url);
    return unwrap<TargetResponse[]>(response.data);
  },

  create: async (payload: TargetUpsertRequest): Promise<TargetResponse> => {
    const response = await api.post('', payload);
    return unwrap<TargetResponse>(response.data);
  },

  update: async (id: number, payload: TargetUpsertRequest): Promise<TargetResponse> => {
    const response = await api.put(`/${id}`, payload);
    return unwrap<TargetResponse>(response.data);
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/${id}`);
  },

  getSalesUsers: async (): Promise<SalesUserWithOrganizations[]> => {
    const response = await api.get('/sales-users');
    return unwrap<SalesUserWithOrganizations[]>(response.data);
  },

  getSalesUserOrganizations: async (userId: number): Promise<SalesUserOrganizationsResponse> => {
    const response = await api.get(`/sales-users/${userId}/organizations`);
    return unwrap<SalesUserOrganizationsResponse>(response.data);
  },

  getUserTargetDetail: async (userId: number, year?: number): Promise<UserTargetDetailResponse> => {
    const queryParams = new URLSearchParams();
    if (year) queryParams.append('year', year.toString());
    const url = `/users/${userId}/detail${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await api.get(url);
    return unwrap<UserTargetDetailResponse>(response.data);
  },

  getCategoryBreakdown: async (
    params: CategoryBreakdownParams,
  ): Promise<CategoryMonthlyBreakdownResponse> => {
    const queryParams = new URLSearchParams();
    queryParams.append('category', params.category);
    if (params.timePreset) queryParams.append('timePreset', params.timePreset);
    if (params.month) queryParams.append('month', params.month.toString());
    if (params.year) queryParams.append('year', params.year.toString());
    if (params.fromMonth) queryParams.append('fromMonth', params.fromMonth.toString());
    if (params.fromYear) queryParams.append('fromYear', params.fromYear.toString());
    if (params.toMonth) queryParams.append('toMonth', params.toMonth.toString());
    if (params.toYear) queryParams.append('toYear', params.toYear.toString());

    const url = `/category-breakdown${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await api.get(url);
    const data = unwrap<CategoryMonthlyBreakdownResponse>(response.data);
    if (!data.months) data.months = [];
    if (!data.totals) {
      data.totals = {
        totalTarget: 0,
        achieved: 0,
        achievementPercent: 0,
        totalDeals: 0,
        incentivePercent: 0,
        incentiveAmount: 0,
      };
    }
    return data;
  },
};

