export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  active: boolean;
  passwordSet: boolean;
  managerId: number | null;
  managerName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  totalMembers?: number;
  directReports?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  managerId?: number | null;
}

export interface UpdateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  managerId?: number | null;
}

export interface SetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

