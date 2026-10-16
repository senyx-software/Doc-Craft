import { env } from './env.js';

export interface ServiceDefinition {
  name: string;
  baseUrl: string;
}

export const services: Record<string, ServiceDefinition> = {
  auth: {
    name: 'auth',
    baseUrl: env.AUTH_SERVICE_URL,
  },
  ai: {
    name: 'ai',
    baseUrl: env.AI_SERVICE_URL,
  },
  document: {
    name: 'document',
    baseUrl: env.DOCUMENT_SERVICE_URL,
  },
  billing: {
    name: 'billing',
    baseUrl: env.BILLING_SERVICE_URL,
  },
  quota: {
    name: 'quota',
    baseUrl: env.QUOTA_SERVICE_URL,
  },
  notification: {
    name: 'notification',
    baseUrl: env.NOTIFICATION_SERVICE_URL,
  },
  analytics: {
    name: 'analytics',
    baseUrl: env.ANALYTICS_SERVICE_URL,
  },
  admin: {
    name: 'admin-api',
    baseUrl: env.ADMIN_API_SERVICE_URL,
  },
};
