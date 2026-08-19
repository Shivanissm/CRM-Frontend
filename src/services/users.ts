import axios from 'axios';
import type { User, ApiResponse, CreateUserRequest, UpdateUserRequest, SetPasswordRequest, InvitationVerification } from '../types/user';
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

// Basic 401/403 handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 || error?.response?.status === 403) {
      console.warn(`Unauthorized (${error?.response?.status}) when calling users API. Logging out.`);
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
  verifyInvitationToken: async (token: string): Promise<InvitationVerification> => {
    const response = await api.get<ApiResponse<InvitationVerification | string>>('/accept-invitation', {
      params: { token },
    });
    const payload = unwrap<InvitationVerification | string>(response.data);
    return parseInvitationVerification(payload);
  },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseInvitationVerification(payload: InvitationVerification | string): InvitationVerification {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed.includes('@')) {
      return { email: trimmed };
    }
    return {};
  }

  if (payload && typeof payload === 'object') {
    const email =
      typeof payload.email === 'string' && payload.email.includes('@') && !UUID_PATTERN.test(payload.email)
        ? payload.email
        : undefined;
    const firstName = typeof payload.firstName === 'string' ? payload.firstName.trim() : undefined;
    const lastName = typeof payload.lastName === 'string' ? payload.lastName.trim() : undefined;
    return { email, firstName, lastName };
  }

  return {};
}

