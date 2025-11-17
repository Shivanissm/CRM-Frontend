import axios from 'axios';
import type { User, ApiResponse, CreateUserRequest, UpdateUserRequest, SetPasswordRequest } from '../types/user';
import { getStoredToken, logoutAndRedirect } from '../utils/authToken';
import { withApiBase } from '../config/api';

const API_BASE_URL = withApiBase('/api/users');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization header for protected endpoints
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    (config.headers = config.headers || {}).Authorization = `Bearer ${token}`;
  }
  return config;
});

// Basic 401 handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      console.warn('Unauthorized (401) when calling users API. Logging out.');
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

export const usersApi = {
  // Get all users
  list: async (): Promise<User[]> => {
    const response = await api.get<ApiResponse<User[]>>('');
    return unwrap<User[]>(response.data);
  },

  // Get user by ID
  getUserById: async (id: number): Promise<User> => {
    const response = await api.get<ApiResponse<User>>(`/${id}`);
    return unwrap<User>(response.data);
  },

  // Create user (ADMIN only)
  createUser: async (userData: CreateUserRequest): Promise<User> => {
    const response = await api.post<ApiResponse<User>>('', userData);
    return unwrap<User>(response.data);
  },

  // Update user (ADMIN only)
  updateUser: async (id: number, userData: UpdateUserRequest): Promise<User> => {
    const response = await api.put<ApiResponse<User>>(`/${id}`, userData);
    return unwrap<User>(response.data);
  },

  // Delete user (ADMIN only)
  deleteUser: async (id: number, reassignManagerId?: number): Promise<void> => {
    const params = reassignManagerId ? { reassignManagerId: reassignManagerId.toString() } : {};
    const response = await api.delete<ApiResponse<void>>(`/${id}`, { params });
    unwrap<void>(response.data);
  },

  // Set password (no auth required)
  setPassword: async (passwordData: SetPasswordRequest): Promise<void> => {
    const response = await api.post<ApiResponse<void>>('/set-password', passwordData);
    unwrap<void>(response.data);
  },

  // Verify invitation token (no auth required)
  verifyInvitationToken: async (token: string): Promise<string> => {
    const response = await api.get<ApiResponse<string>>('/accept-invitation', {
      params: { token },
    });
    return unwrap<string>(response.data);
  },
};

