export const API_ENDPOINTS = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    logout: '/auth/logout',
    me: '/auth/me',
    google: '/auth/google',
    passwordReset: '/auth/password-reset',
    guest: '/auth/guest',
  },
  chat: {
    start: '/chat/start',
    send: '/chat/send',
    confirmCorrection: '/chat/confirm-correction',
    missingFields: '/chat/missing-fields',
    summary: '/chat/summary',
  },
  document: {
    generate: '/document/generate',
    updateLayout: '/document/update-layout',
    updateContent: '/document/update-content',
    templates: '/document/templates',
  },
  quota: {
    check: '/quota/check',
  },
  payment: {
    checkout: '/payment/checkout',
    portal: '/payment/portal',
  }
};
