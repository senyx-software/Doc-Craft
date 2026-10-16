import { post } from './client';

export interface SubmitTicketPayload {
  user_email: string;
  subject: string;
  message: string;
  category?: string;
  priority?: string;
  user_id?: string;
  session_id?: string;
}

export interface SubmitRefundPayload {
  user_email: string;
  reason: string;
  user_id?: string;
  subscription_id?: string;
  invoice_id?: string;
  amount?: number;
  currency?: string;
  gateway?: string;
}

export interface SubmitContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
  user_id?: string;
}

export interface SubmitOverridePayload {
  user_email: string;
  requested_plan: string;
  reason: string;
  user_id?: string;
  current_plan?: string;
  requested_quota?: number;
}

/** Submit support ticket / issue */
export function submitSupportTicket(payload: SubmitTicketPayload) {
  return post('/support/tickets', payload, false);
}

/** Submit refund request */
export function submitRefundRequest(payload: SubmitRefundPayload) {
  return post('/support/refunds', payload, false);
}

/** Submit contact form */
export function submitContactForm(payload: SubmitContactPayload) {
  return post('/support/contact', payload, false);
}

/** Submit manual plan override request */
export function submitPlanOverrideRequest(payload: SubmitOverridePayload) {
  return post('/support/plan-override-requests', payload, false);
}
