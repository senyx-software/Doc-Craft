import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  createdAt: number;
}

const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  // Errors carry the "why" and are the ones an admin most needs to actually
  // read, so they stay up longer instead of vanishing at the same pace.
  error: 8000,
};

interface ToastState {
  toasts: Toast[];
  push: (type: ToastType, title: string, message?: string) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (type, title, message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ toasts: [...state.toasts, { id, type, title, message, createdAt: Date.now() }] }));
    window.setTimeout(() => get().dismiss(id), DURATIONS[type]);
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// Extracts the specific backend/network reason behind a failure rather than
// a generic "something went wrong" — adminApiClient's apiRequest() already
// throws Error(data.message || data.detail || ...) so err.message usually
// *is* the real reason; this just guards the shapes that don't fit that.
export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return fallback;
}

export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().push('success', title, message),
  error: (title: string, err?: unknown) => useToastStore.getState().push('error', title, err !== undefined ? getErrorMessage(err) : undefined),
  warning: (title: string, message?: string) => useToastStore.getState().push('warning', title, message),
  info: (title: string, message?: string) => useToastStore.getState().push('info', title, message),
};
