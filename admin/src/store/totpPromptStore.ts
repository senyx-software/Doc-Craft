import { create } from 'zustand';

/**
 * TotpPromptStore — bridges adminApiClient's plain async apiRequest() to the
 * React tree so a sensitive action (backend 403 TOTP_REQUIRED) can pop a
 * modal and await the code the admin types in, without every call site
 * having to manage its own 2FA UI. See TotpPromptModal, mounted once in
 * App.tsx, for the consumer side.
 */
interface TotpPromptState {
  isOpen: boolean;
  errorMessage: string | null;
  resolver: ((code: string) => void) | null;
  rejecter: ((reason: Error) => void) | null;
}

interface TotpPromptActions {
  /** Opens the modal and resolves once the admin submits a code (rejects on cancel). */
  requestCode: (errorMessage?: string | null) => Promise<string>;
  submit: (code: string) => void;
  cancel: () => void;
}

export const useTotpPromptStore = create<TotpPromptState & TotpPromptActions>((set, get) => ({
  isOpen: false,
  errorMessage: null,
  resolver: null,
  rejecter: null,

  requestCode: (errorMessage = null) => {
    return new Promise<string>((resolve, reject) => {
      set({ isOpen: true, errorMessage, resolver: resolve, rejecter: reject });
    });
  },

  submit: (code: string) => {
    const { resolver } = get();
    set({ isOpen: false, errorMessage: null, resolver: null, rejecter: null });
    resolver?.(code);
  },

  cancel: () => {
    const { rejecter } = get();
    set({ isOpen: false, errorMessage: null, resolver: null, rejecter: null });
    rejecter?.(new Error('2FA verification was cancelled.'));
  },
}));
