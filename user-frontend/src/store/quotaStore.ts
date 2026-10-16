/**
 * Quota Store — Zustand
 * Manages quota status and subscription info.
 * Includes DEMO MODE with mock quota data.
 */

import type { Entitlements } from '../../../shared/entitlements.mjs';
import {get} from '../api/client';
import { create } from 'zustand';
import type { Quota, Subscription } from '../types';
import * as billingApi from '../api/billing';
import { redirectToCheckout } from '../api/payment';

// Sentinel quota value meaning "no daily cap" — mirrors UNLIMITED_QUOTA in
// the admin-api and Quota Service backends. An admin can assign it to any
// plan/user, so it must be read from the fetched quota, never assumed from
// the plan name.
export const UNLIMITED_QUOTA = -1;

function isDemoMode(): boolean {
  return localStorage.getItem('doccraft_token') === 'demo_token_for_testing';
}

function isGuestMode(): boolean {
  // Check if the current user is a guest (user_id starts with 'guest_')
  // We check localStorage to avoid a circular import from authStore
  try {
    // Zustand persists authStore if configured, but authStore doesn't use persist.
    // Instead, check the raw token — guest JWTs have sub starting with 'guest_'.
    // Decode without verification (we just need the payload to check the sub).
    const token = localStorage.getItem('doccraft_token');
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' && payload.sub.startsWith('guest_');
  } catch {
    return false;
  }
}



interface QuotaState {
  quota: Quota | null;
  entitlements:Entitlements|null;
  subscription: Subscription | null;
  showUpgradeModal: boolean;
  showGuestDownloadModal: boolean;
  isLoading: boolean;

  fetchQuota: () => Promise<void>;
  fetchSubscription: () => Promise<void>;
  checkout: (plan: 'pro_monthly' | 'pro_annual') => Promise<void>;
  openPortal: () => Promise<void>;
  setShowUpgradeModal: (show: boolean) => void;
  setShowGuestDownloadModal: (show: boolean) => void;
}

export const useQuotaStore = create<QuotaState>((set) => ({
  quota: null,
  entitlements:null,
  subscription: null,
  showUpgradeModal: false,
  showGuestDownloadModal: false,
  isLoading: false,

  fetchQuota: async () => {
    // Demo mode uses a fake, non-JWT token (`demo_token_for_testing`), so
    // `/quota/me` would reject it — only demo mode needs mocked numbers here.
    // A real guest session (isGuestMode()) holds a genuine JWT issued by
    // /auth/guest, so it fetches live quota just like any signed-up user —
    // that's what makes the admin-configured 'guest' plan limit (see the
    // Quota Service / admin-api plans table) actually show up in this UI.
    if (isDemoMode()) {
      const authStore = await import('./authStore');
      const plan = authStore.useAuthStore.getState().user?.plan || 'free';
      set({
        quota: {
          plan,
          daily_limit: plan === 'pro' ? UNLIMITED_QUOTA : 3,
          used_today: 1,
          remaining: plan === 'pro' ? UNLIMITED_QUOTA : 2,
          resets_at: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
        },
      });
      return;
    }

    try {
      const [quota,entitlements] = await Promise.all([billingApi.getQuota(),get<Entitlements>("/quota/entitlements")]);
      set({ quota,entitlements });
    } catch {
      set({quota:null,entitlements:null});
    }
  },


  fetchSubscription: async () => {
    if (isDemoMode() || isGuestMode()) {
      const authStore = await import('./authStore');
      const plan = authStore.useAuthStore.getState().user?.plan;
      if (plan === 'pro') {
        set({
          subscription: {
            plan: 'pro_monthly',
            status: 'active',
            current_period_end: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
            stripe_customer_id: 'demo_cus_123',
          }
        });
      } else {
        set({ subscription: null });
      }
      return;
    }

    try {
      const subscription = await billingApi.getSubscription();
      set({ subscription });
    } catch {
      // Silent fail — user may not have a subscription
    }
  },


  checkout: async (plan: 'pro_monthly' | 'pro_annual') => {
    if (isDemoMode()) {
      alert(`Demo mode: Would redirect to Stripe checkout for "${plan}" plan.`);
      return;
    }

    set({ isLoading: true });
    try {
      const response = await billingApi.createCheckout(plan);
      redirectToCheckout(response);
    } catch {
      set({ isLoading: false });
    }
  },

  openPortal: async () => {
    if (isDemoMode()) {
      alert('Demo mode: Would redirect to Stripe billing portal.');
      return;
    }

    try {
      const response = await billingApi.createPortal();
      window.location.href = response.portal_url;
    } catch {
      set({quota:null,entitlements:null});
    }
  },

  setShowUpgradeModal: (show: boolean) => set({ showUpgradeModal: show }),
  setShowGuestDownloadModal: (show: boolean) => set({ showGuestDownloadModal: show }),
}));
