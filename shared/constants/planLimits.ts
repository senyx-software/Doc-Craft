export const PLAN_LIMITS = {
  free: {
    dailyLimit: 3,
    hasWatermark: true,
    customBranding: false,
    documentHistory: false,
  },
  pro: {
    dailyLimit: Infinity,
    hasWatermark: false,
    customBranding: true,
    documentHistory: true,
  }
};
