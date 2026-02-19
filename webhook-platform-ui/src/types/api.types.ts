export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface UserResponse {
  id: string;
  email: string;
  status: string;
}

export interface CurrentUserResponse {
  user: UserResponse;
  organization: OrganizationResponse;
  role: 'OWNER' | 'DEVELOPER' | 'VIEWER';
}

export interface OrganizationResponse {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProjectRequest {
  name: string;
  description?: string;
}

export interface ProjectResponse {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EndpointRequest {
  url: string;
  description?: string;
  secret?: string;
  enabled?: boolean;
  rateLimitPerSecond?: number;
  allowedSourceIps?: string;
}

export interface EndpointResponse {
  id: string;
  projectId: string;
  url: string;
  description?: string;
  enabled: boolean;
  rateLimitPerSecond?: number;
  allowedSourceIps?: string;
  mtlsEnabled?: boolean;
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'FAILED' | 'SKIPPED';
  verificationAttemptedAt?: string;
  verificationCompletedAt?: string;
  verificationSkipReason?: string;
  createdAt: string;
  updatedAt: string;
  secret?: string;
}

export interface DeliveryResponse {
  id: string;
  eventId: string;
  endpointId: string;
  subscriptionId: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'DLQ';
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: string;
  lastAttemptAt?: string;
  succeededAt?: string;
  failedAt?: string;
  createdAt: string;
}

export interface DeliveryAttemptResponse {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  requestHeaders?: string;
  requestBody?: string;
  httpStatusCode?: number;
  responseHeaders?: string;
  responseBody?: string;
  errorMessage?: string;
  durationMs?: number;
  createdAt: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface EventResponse {
  id: string;
  projectId: string;
  eventType: string;
  payload: string;
  createdAt: string;
  deliveriesCreated?: number;
}

export interface SubscriptionResponse {
  id: string;
  projectId: string;
  endpointId: string;
  eventType: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
