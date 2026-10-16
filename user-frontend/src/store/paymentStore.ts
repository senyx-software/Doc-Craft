import { create } from 'zustand';
import * as paymentApi from '../api/payment';
import type { PaymentMethodItem, AddPaymentMethodPayload } from '../api/payment';

interface PaymentState {
  paymentMethods: PaymentMethodItem[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  fetchPaymentMethods: () => Promise<void>;
  addPaymentMethod: (data: AddPaymentMethodPayload) => Promise<boolean>;
  removePaymentMethod: (id: string) => Promise<boolean>;
  setAsDefault: (id: string) => Promise<boolean>;
  clearError: () => void;
}

export const usePaymentStore = create<PaymentState>((set, get) => ({
  paymentMethods: [],
  isLoading: false,
  isSaving: false,
  error: null,

  fetchPaymentMethods: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await paymentApi.getPaymentMethods();
      set({ paymentMethods: res.methods || [], isLoading: false });
    } catch (err) {
      set({ error: (err instanceof Error ? err.message : '') || 'Failed to fetch payment methods', isLoading: false });
    }
  },

  addPaymentMethod: async (data) => {
    set({ isSaving: true, error: null });
    try {
      const res = await paymentApi.addPaymentMethod(data);
      if (res.success && res.method) {
        const current = get().paymentMethods;
        const updated = res.method.isDefault
          ? [res.method, ...current.map((m) => ({ ...m, isDefault: false }))]
          : [...current, res.method];
        set({ paymentMethods: updated, isSaving: false });
        return true;
      }
      set({ isSaving: false });
      return false;
    } catch (err) {
      set({ error: (err instanceof Error ? err.message : '') || 'Failed to save payment method', isSaving: false });
      return false;
    }
  },

  removePaymentMethod: async (id) => {
    try {
      const current = get().paymentMethods;
      const updated = current.filter((m) => m.id !== id);
      await paymentApi.deletePaymentMethod(id);
      set({ paymentMethods: updated });
      return true;
    } catch (err) {
      set({ error: (err instanceof Error ? err.message : '') || 'Failed to delete payment method' });
      return false;
    }
  },

  setAsDefault: async (id) => {
    try {
      const current = get().paymentMethods;
      const updated = current.map((m) => ({
        ...m,
        isDefault: m.id === id,
      }));
      await paymentApi.setDefaultPaymentMethod(id);
      set({ paymentMethods: updated });
      return true;
    } catch (err) {
      set({ error: (err instanceof Error ? err.message : '') || 'Failed to set default payment method' });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
