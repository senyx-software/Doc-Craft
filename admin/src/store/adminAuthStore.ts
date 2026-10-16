import { create } from 'zustand';
import { getErrorMessage } from './toastStore';

export type AdminRole = 'Super Admin' | 'Finance Admin' | 'Support Admin' | string;

export interface AdminUser {
  id: string;
  name: string;
  role: AdminRole;
  email: string;
  isSuperAdmin: boolean;
  permissions: string[];
}

interface AdminAuthState {
  admin: AdminUser | null;
  token: string | null;
  isAuthenticated: boolean;

  loginWithApi: (email: string, password: string, totpCode?: string) => Promise<{ success: boolean; requiresTotp?: boolean; message?: string; hint?: string }>;
  forgotPasswordApi: (email: string) => Promise<{ success: boolean; message: string; hint?: string }>;
  resetPasswordApi: (email: string, code: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  changePasswordApi: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  updateProfileApi: (name: string) => Promise<{ success: boolean; message: string }>;
  validateToken: () => boolean;
  logout: () => void;
}

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_BASE_URL || 'http://localhost:3018/api/v1';

// Check saved session in localStorage
const savedToken = localStorage.getItem('admin_token');
const savedAdminJson = localStorage.getItem('admin_user');
let initialAdmin: AdminUser | null = null;

if (savedAdminJson) {
  try {
    initialAdmin = JSON.parse(savedAdminJson);
  } catch {
    initialAdmin = null;
  }
}

export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  admin: initialAdmin,
  token: savedToken,
  isAuthenticated: Boolean(savedToken && initialAdmin),

  loginWithApi: async (email, password, totpCode) => {
    try {
      if (totpCode) {
        // Step 2: Submit email and 2FA verification code
        const response = await fetch(`${API_BASE_URL}/admin/auth/verify-login-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, verification_code: totpCode }),
        });
        const data = await response.json();
        if (!response.ok) {
          return { success: false, message: data.detail || data.message || 'Verification failed' };
        }

        const adminUser: AdminUser = {
          id: data.admin_id,
          name: data.name || (data.email || email).split('@')[0],
          role: data.role_name || 'Staff',
          email: data.email || email,
          isSuperAdmin: data.is_super_admin === true,
          permissions: Array.isArray(data.permissions) ? data.permissions.filter((permission: unknown): permission is string => typeof permission === 'string') : [],
        };

        localStorage.setItem('admin_token', data.access_token);
        localStorage.setItem('admin_user', JSON.stringify(adminUser));

        set({
          token: data.access_token,
          isAuthenticated: true,
          admin: adminUser,
        });
        return { success: true };
      } else {
        // Step 1: Submit email and password to FastAPI backend
        const response = await fetch(`${API_BASE_URL}/admin/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (!response.ok) {
          return { success: false, message: data.detail || data.message || 'Authentication failed' };
        }

        // If backend returned 2FA requirement with code hint
        if (data.status === '2fa_required' || data.status === 'verification_code_required') {
          return {
            success: true,
            requiresTotp: true,
            message: data.message,
            hint: data.verification_code_hint,
          };
        }

        // If direct access token returned
        if (data.access_token) {
          const adminUser: AdminUser = {
            id: data.admin_id,
            name: data.name || (data.email || email).split('@')[0],
            role: data.role_name || 'Staff',
            email: data.email || email,
            isSuperAdmin: data.is_super_admin === true,
            permissions: Array.isArray(data.permissions) ? data.permissions.filter((permission: unknown): permission is string => typeof permission === 'string') : [],
          };

          localStorage.setItem('admin_token', data.access_token);
          localStorage.setItem('admin_user', JSON.stringify(adminUser));

          set({
            token: data.access_token,
            isAuthenticated: true,
            admin: adminUser,
          });
          return { success: true };
        }

        return {
          success: true,
          requiresTotp: true,
          message: data.message,
          hint: data.verification_code_hint,
        };
      }
    } catch (err) {
      return { success: false, message: getErrorMessage(err, 'Unable to connect to Admin API') };
    }
  },

  forgotPasswordApi: async (email) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, message: data.detail || data.message || 'Failed to send reset code' };
      }
      return {
        success: true,
        message: data.message,
        hint: data.verification_code_hint,
      };
    } catch (err) {
      return {
        success: false,
        message: getErrorMessage(err, 'Unable to request password recovery'),
      };
    }
  },

  resetPasswordApi: async (email, code, newPassword) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, verification_code: code, new_password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, message: data.detail || data.message || 'Password reset failed' };
      }
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, message: getErrorMessage(err, 'Unable to reset password') };
    }
  },

  changePasswordApi: async (currentPassword, newPassword) => {
    const { token } = get();
    try {
      const response = await fetch(`${API_BASE_URL}/admin/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, message: data.detail || data.message || 'Password change failed' };
      }
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, message: getErrorMessage(err, 'Unable to change password') };
    }
  },

  updateProfileApi: async (name) => {
    const { token, admin } = get();
    try {
      const response = await fetch(`${API_BASE_URL}/admin/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, message: data.detail || data.message || 'Profile update failed' };
      }
      if (admin) {
        const updatedAdmin: AdminUser = { ...admin, name: data.name || admin.name };
        localStorage.setItem('admin_user', JSON.stringify(updatedAdmin));
        set({ admin: updatedAdmin });
      }
      return { success: true, message: 'Profile updated.' };
    } catch (err) {
      return { success: false, message: getErrorMessage(err, 'Unable to connect to Admin API') };
    }
  },

  validateToken: () => {
    const { token } = get();
    if (!token) return false;
    try {
      if (token.split('.').length !== 3) { get().logout(); return false; }
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          console.warn('[AuthStore] Session token expired. Automatically logging out.');
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_user');
          set({ admin: null, token: null, isAuthenticated: false });
          return false;
        }
      }
      return true;
    } catch {
      get().logout();
      return false;
    }
  },

  logout: () => {
    const token=get().token;
    if(token)void fetch(`${API_BASE_URL}/admin/auth/logout`,{method:'POST',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)}).catch(()=>{console.warn('Server session revocation unavailable; local session cleared.');});
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    set({ admin: null, token: null, isAuthenticated: false });
  },
}));
