import type { Plan } from './plan.types';

export interface Quota {
  plan: Plan;
  daily_limit: number;
  used_today: number;
  remaining: number;
  resets_at: string;
}

export interface QuotaExceededResponse {
  error: 'quota_exceeded';
  message: string;
  actions: string[];
  resets_at: string;
}
