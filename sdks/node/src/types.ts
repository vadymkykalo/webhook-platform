export interface WebhookPlatformConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface Event {
  type: string;
  data: Record<string, unknown>;
}

export interface EventResponse {
  eventId: string;
  type: string;
  createdAt: string;
  deliveriesCreated: number;
}

export interface Endpoint {
  id: string;
  url: string;
  description?: string;
  secret: string;
  enabled: boolean;
  rateLimitPerSecond?: number;
  createdAt: string;
}

export interface EndpointCreateParams {
  url: string;
  description?: string;
  enabled?: boolean;
  rateLimitPerSecond?: number;
}

export interface EndpointUpdateParams {
  url?: string;
  description?: string;
  enabled?: boolean;
  rateLimitPerSecond?: number;
}

export interface Subscription {
  id: string;
  endpointId: string;
  eventTypes: string[];
  enabled: boolean;
  createdAt: string;
}

export interface SubscriptionCreateParams {
  endpointId: string;
  eventTypes: string[];
  enabled?: boolean;
}

export interface Delivery {
  id: string;
  eventId: string;
  endpointId: string;
  status: DeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt?: string;
  createdAt: string;
  succeededAt?: string;
}

export type DeliveryStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'DEAD_LETTER';

export interface DeliveryAttempt {
  id: string;
  attemptNumber: number;
  httpStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  latencyMs: number;
  attemptedAt: string;
}

export interface PaginatedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface DeliveryListParams {
  status?: DeliveryStatus;
  endpointId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  size?: number;
}

export interface EndpointTestResult {
  success: boolean;
  httpStatus?: number;
  latencyMs: number;
  errorMessage?: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export interface WebhookEvent {
  eventId: string;
  deliveryId: string;
  timestamp: number;
  type: string;
  data: Record<string, unknown>;
}
