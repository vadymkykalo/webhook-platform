export interface HookflowConfig {
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
  projectId: string;
  url: string;
  description?: string;
  secret?: string;
  enabled: boolean;
  rateLimitPerSecond?: number;
  allowedSourceIps?: string;
  mtlsEnabled?: boolean;
  verificationStatus?: string;
  createdAt: string;
  updatedAt?: string;
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
  projectId: string;
  endpointId: string;
  eventType: string;
  enabled: boolean;
  orderingEnabled: boolean;
  maxAttempts: number;
  timeoutSeconds: number;
  retryDelays?: string;
  payloadTemplate?: string;
  customHeaders?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SubscriptionCreateParams {
  endpointId: string;
  eventType: string;
  enabled?: boolean;
  orderingEnabled?: boolean;
  maxAttempts?: number;
  timeoutSeconds?: number;
  retryDelays?: string;
  payloadTemplate?: string;
  customHeaders?: string;
}

export interface Delivery {
  id: string;
  eventId: string;
  endpointId: string;
  subscriptionId: string;
  status: DeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: string;
  lastAttemptAt?: string;
  succeededAt?: string;
  failedAt?: string;
  createdAt: string;
}

export type DeliveryStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'DLQ';

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

// ── Incoming Webhooks ──

export type ProviderType = 'GENERIC' | 'STRIPE' | 'GITHUB' | 'TWILIO' | 'SHOPIFY' | 'HUBSPOT' | 'SLACK' | 'CUSTOM';
export type VerificationMode = 'NONE' | 'HMAC_GENERIC';
export type IncomingSourceStatus = 'ACTIVE' | 'DISABLED';
export type IncomingAuthType = 'NONE' | 'BEARER' | 'BASIC' | 'CUSTOM_HEADER';

export interface IncomingSource {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  providerType: ProviderType;
  status: IncomingSourceStatus;
  ingressPathToken: string;
  ingressUrl: string;
  verificationMode: VerificationMode;
  hmacHeaderName?: string;
  hmacSignaturePrefix?: string;
  hmacSecretConfigured: boolean;
  rateLimitPerSecond?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface IncomingSourceCreateParams {
  name: string;
  slug?: string;
  providerType?: ProviderType;
  verificationMode?: VerificationMode;
  hmacSecret?: string;
  hmacHeaderName?: string;
  hmacSignaturePrefix?: string;
  rateLimitPerSecond?: number;
}

export interface IncomingSourceUpdateParams {
  name?: string;
  slug?: string;
  providerType?: ProviderType;
  status?: IncomingSourceStatus;
  verificationMode?: VerificationMode;
  hmacSecret?: string;
  hmacHeaderName?: string;
  hmacSignaturePrefix?: string;
  rateLimitPerSecond?: number;
}

export interface IncomingDestination {
  id: string;
  incomingSourceId: string;
  url: string;
  authType: IncomingAuthType;
  authConfigured: boolean;
  customHeadersJson?: string;
  enabled: boolean;
  maxAttempts: number;
  timeoutSeconds: number;
  retryDelays?: string;
  payloadTransform?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface IncomingDestinationCreateParams {
  url: string;
  authType?: IncomingAuthType;
  authConfig?: string;
  customHeadersJson?: string;
  enabled?: boolean;
  maxAttempts?: number;
  timeoutSeconds?: number;
  retryDelays?: string;
  payloadTransform?: string;
}

export interface IncomingDestinationUpdateParams {
  url?: string;
  authType?: IncomingAuthType;
  authConfig?: string;
  customHeadersJson?: string;
  enabled?: boolean;
  maxAttempts?: number;
  timeoutSeconds?: number;
  retryDelays?: string;
  payloadTransform?: string;
}

export interface IncomingEvent {
  id: string;
  incomingSourceId: string;
  sourceName: string;
  requestId: string;
  method: string;
  path: string;
  queryParams?: string;
  headersJson?: string;
  bodyRaw?: string;
  bodySha256?: string;
  contentType?: string;
  clientIp?: string;
  userAgent?: string;
  verified?: boolean;
  verificationError?: string;
  receivedAt: string;
}

export interface IncomingEventListParams {
  sourceId?: string;
  page?: number;
  size?: number;
}

export type ForwardAttemptStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'DLQ';

export interface IncomingForwardAttempt {
  id: string;
  incomingEventId: string;
  destinationId: string;
  destinationUrl: string;
  attemptNumber: number;
  status: ForwardAttemptStatus;
  startedAt?: string;
  finishedAt?: string;
  responseCode?: number;
  responseHeadersJson?: string;
  responseBodySnippet?: string;
  errorMessage?: string;
  nextRetryAt?: string;
  createdAt: string;
}

export interface ReplayEventResponse {
  status: string;
  eventId: string;
  destinationsCount: number;
}
