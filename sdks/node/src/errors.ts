import { RateLimitInfo } from './types';

export class WebhookPlatformError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'WebhookPlatformError';
    this.status = status;
    this.code = code;
  }
}

export class AuthenticationError extends WebhookPlatformError {
  constructor(message: string = 'Invalid API key') {
    super(message, 401, 'authentication_error');
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends WebhookPlatformError {
  public readonly rateLimitInfo: RateLimitInfo;

  constructor(message: string, rateLimitInfo: RateLimitInfo) {
    super(message, 429, 'rate_limit_exceeded');
    this.name = 'RateLimitError';
    this.rateLimitInfo = rateLimitInfo;
  }

  get retryAfter(): number {
    return Math.max(0, this.rateLimitInfo.reset - Date.now());
  }
}

export class ValidationError extends WebhookPlatformError {
  public readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message, 400, 'validation_error');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends WebhookPlatformError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'not_found');
    this.name = 'NotFoundError';
  }
}
