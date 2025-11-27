import axios from 'axios';
import type {
  Team,
  TeamManagerOption,
  TeamMemberOption,
  TeamRequest,
  TeamUpdateRequest,
} from '../types/team';
import { getStoredToken, logoutAndRedirect } from '../utils/authToken';
import { withApiBase } from '../config/api';

const api = axios.create({
  baseURL: withApiBase('/api/teams'),
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
      console.warn(`Unauthorized (${error?.response?.status}) when calling teams API. Logging out.`);
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

export const teamsApi = {
  list: async (): Promise<Team[]> => {
    const response = await api.get('');
    return unwrap<Team[]>(response.data);
  },

  get: async (id: number): Promise<Team> => {
    const response = await api.get(`/${id}`);
    return unwrap<Team>(response.data);
  },

  create: async (payload: TeamRequest): Promise<Team> => {
    const response = await api.post('', payload);
    return unwrap<Team>(response.data);
  },

  update: async (id: number, payload: TeamUpdateRequest): Promise<Team> => {
    const response = await api.put(`/${id}`, payload);
    return unwrap<Team>(response.data);
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/${id}`);
  },

  listManagers: async (): Promise<TeamManagerOption[]> => {
    const response = await api.get('/managers');
    return unwrap<TeamManagerOption[]>(response.data);
  },

  listMembers: async (): Promise<TeamMemberOption[]> => {
    const response = await api.get('/members');
    return unwrap<TeamMemberOption[]>(response.data);
  },
};


