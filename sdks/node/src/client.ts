import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import {
  WebhookPlatformConfig,
  Event,
  EventResponse,
  Endpoint,
  EndpointCreateParams,
  EndpointUpdateParams,
  Subscription,
  SubscriptionCreateParams,
  Delivery,
  DeliveryAttempt,
  DeliveryListParams,
  PaginatedResponse,
  EndpointTestResult,
  RateLimitInfo,
} from './types';
import {
  WebhookPlatformError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
} from './errors';

const DEFAULT_BASE_URL = 'http://localhost:8080';
const DEFAULT_TIMEOUT = 30000;
const SDK_VERSION = '1.1.0';

export class WebhookPlatform {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  public readonly events: Events;
  public readonly endpoints: Endpoints;
  public readonly subscriptions: Subscriptions;
  public readonly deliveries: Deliveries;

  constructor(config: WebhookPlatformConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;

    this.events = new Events(this);
    this.endpoints = new Endpoints(this);
    this.subscriptions = new Subscriptions(this);
    this.deliveries = new Deliveries(this);
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': `webhook-platform-node/${SDK_VERSION}`,
    };

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const options: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers,
      timeout: this.timeout,
    };

    return new Promise((resolve, reject) => {
      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const rateLimitInfo = this.extractRateLimitInfo(res.headers);
            
            if (res.statusCode === 204) {
              resolve(undefined as T);
              return;
            }

            const parsed = data ? JSON.parse(data) : {};

            if (res.statusCode && res.statusCode >= 400) {
              reject(this.handleError(res.statusCode, parsed, rateLimitInfo));
              return;
            }

            resolve(parsed as T);
          } catch (err) {
            reject(new WebhookPlatformError('Failed to parse response', 500));
          }
        });
      });

      req.on('error', (err) => {
        reject(new WebhookPlatformError(err.message, 0, 'network_error'));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new WebhookPlatformError('Request timeout', 0, 'timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  private extractRateLimitInfo(headers: http.IncomingHttpHeaders): RateLimitInfo | undefined {
    const limit = headers['x-ratelimit-limit'];
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];

    if (limit && remaining && reset) {
      return {
        limit: parseInt(limit as string, 10),
        remaining: parseInt(remaining as string, 10),
        reset: parseInt(reset as string, 10),
      };
    }
    return undefined;
  }

  private handleError(
    status: number,
    body: Record<string, unknown>,
    rateLimitInfo?: RateLimitInfo
  ): WebhookPlatformError {
    const message = (body.message as string) || 'Unknown error';

    switch (status) {
      case 401:
        return new AuthenticationError(message);
      case 404:
        return new NotFoundError(message);
      case 429:
        return new RateLimitError(
          message,
          rateLimitInfo || { limit: 0, remaining: 0, reset: Date.now() + 60000 }
        );
      case 400:
        return new ValidationError(
          message,
          (body.fieldErrors as Record<string, string>) || {}
        );
      default:
        return new WebhookPlatformError(message, status, body.error as string);
    }
  }
}

class Events {
  constructor(private client: WebhookPlatform) {}

  async send(event: Event, idempotencyKey?: string): Promise<EventResponse> {
    return this.client.request<EventResponse>(
      'POST',
      '/api/v1/events',
      event,
      idempotencyKey
    );
  }
}

class Endpoints {
  constructor(private client: WebhookPlatform) {}

  async create(projectId: string, params: EndpointCreateParams): Promise<Endpoint> {
    return this.client.request<Endpoint>(
      'POST',
      `/api/v1/projects/${projectId}/endpoints`,
      params
    );
  }

  async get(projectId: string, endpointId: string): Promise<Endpoint> {
    return this.client.request<Endpoint>(
      'GET',
      `/api/v1/projects/${projectId}/endpoints/${endpointId}`
    );
  }

  async list(projectId: string): Promise<Endpoint[]> {
    return this.client.request<Endpoint[]>(
      'GET',
      `/api/v1/projects/${projectId}/endpoints`
    );
  }

  async update(
    projectId: string,
    endpointId: string,
    params: EndpointUpdateParams
  ): Promise<Endpoint> {
    return this.client.request<Endpoint>(
      'PUT',
      `/api/v1/projects/${projectId}/endpoints/${endpointId}`,
      params
    );
  }

  async delete(projectId: string, endpointId: string): Promise<void> {
    return this.client.request<void>(
      'DELETE',
      `/api/v1/projects/${projectId}/endpoints/${endpointId}`
    );
  }

  async rotateSecret(projectId: string, endpointId: string): Promise<Endpoint> {
    return this.client.request<Endpoint>(
      'POST',
      `/api/v1/projects/${projectId}/endpoints/${endpointId}/rotate-secret`
    );
  }

  async test(projectId: string, endpointId: string): Promise<EndpointTestResult> {
    return this.client.request<EndpointTestResult>(
      'POST',
      `/api/v1/projects/${projectId}/endpoints/${endpointId}/test`
    );
  }
}

class Subscriptions {
  constructor(private client: WebhookPlatform) {}

  async create(projectId: string, params: SubscriptionCreateParams): Promise<Subscription> {
    return this.client.request<Subscription>(
      'POST',
      `/api/v1/projects/${projectId}/subscriptions`,
      params
    );
  }

  async get(projectId: string, subscriptionId: string): Promise<Subscription> {
    return this.client.request<Subscription>(
      'GET',
      `/api/v1/projects/${projectId}/subscriptions/${subscriptionId}`
    );
  }

  async list(projectId: string): Promise<Subscription[]> {
    return this.client.request<Subscription[]>(
      'GET',
      `/api/v1/projects/${projectId}/subscriptions`
    );
  }

  async update(
    projectId: string,
    subscriptionId: string,
    params: Partial<SubscriptionCreateParams>
  ): Promise<Subscription> {
    return this.client.request<Subscription>(
      'PUT',
      `/api/v1/projects/${projectId}/subscriptions/${subscriptionId}`,
      params
    );
  }

  async delete(projectId: string, subscriptionId: string): Promise<void> {
    return this.client.request<void>(
      'DELETE',
      `/api/v1/projects/${projectId}/subscriptions/${subscriptionId}`
    );
  }
}

class Deliveries {
  constructor(private client: WebhookPlatform) {}

  async get(deliveryId: string): Promise<Delivery> {
    return this.client.request<Delivery>('GET', `/api/v1/deliveries/${deliveryId}`);
  }

  async list(
    projectId: string,
    params: DeliveryListParams = {}
  ): Promise<PaginatedResponse<Delivery>> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.endpointId) query.set('endpointId', params.endpointId);
    if (params.fromDate) query.set('fromDate', params.fromDate);
    if (params.toDate) query.set('toDate', params.toDate);
    if (params.page !== undefined) query.set('page', params.page.toString());
    if (params.size !== undefined) query.set('size', params.size.toString());

    const queryString = query.toString();
    const path = `/api/v1/deliveries/projects/${projectId}${queryString ? `?${queryString}` : ''}`;

    return this.client.request<PaginatedResponse<Delivery>>('GET', path);
  }

  async getAttempts(deliveryId: string): Promise<DeliveryAttempt[]> {
    return this.client.request<DeliveryAttempt[]>(
      'GET',
      `/api/v1/deliveries/${deliveryId}/attempts`
    );
  }

  async replay(deliveryId: string): Promise<void> {
    return this.client.request<void>('POST', `/api/v1/deliveries/${deliveryId}/replay`);
  }
}
