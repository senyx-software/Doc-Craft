import { services, type ServiceDefinition } from '../config/services.config.js';

/**
 * ServiceRegistry — manages route prefix maps and resolves destination hosts.
 */
class ServiceRegistry {
  private registry = new Map<string, ServiceDefinition>();

  constructor() {
    this.register('/v1/auth',         services.auth);
    this.register('/v1/users',        services.auth);
    this.register('/v1/ai',           services.ai);
    this.register('/v1/chat',          services.ai);
    this.register('/v1/document',     services.document);
    this.register('/v1/documents',    services.document);
    this.register('/v1/templates',    services.document);
    this.register('/v1/payment',      services.billing);
    this.register('/v1/billing',      services.billing);
    this.register('/v1/quota',        services.quota);
    this.register('/v1/notification', services.notification);
    this.register('/v1/notifications', services.notification);
    this.register('/v1/analytics',    services.analytics);
    this.register('/v1/admin',        services.admin);
    this.register('/v1/support',      services.admin);
  }

  public register(prefix: string, service: ServiceDefinition): void {
    this.registry.set(prefix, service);
  }

  public resolve(path: string): ServiceDefinition | null {
    // Match the longest prefix first
    let matchedPrefix = '';
    let matchedService: ServiceDefinition | null = null;

    for (const [prefix, service] of this.registry.entries()) {
      if ((path === prefix || path.startsWith(prefix + '/')) && prefix.length > matchedPrefix.length) {
        matchedPrefix = prefix;
        matchedService = service;
      }
    }

    return matchedService;
  }
}

export const serviceRegistry = new ServiceRegistry();
