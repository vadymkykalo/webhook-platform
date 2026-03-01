import { RateLimitInfo } from './types';

export class HookflowError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'HookflowError';
    this.status = status;
    this.code = code;
  }
}

export class AuthenticationError extends HookflowError {
  constructor(message: string = 'Invalid API key') {
    super(message, 401, 'authentication_error');
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends HookflowError {
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

export class ValidationError extends HookflowError {
  public readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message, 400, 'validation_error');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends HookflowError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'not_found');
    this.name = 'NotFoundError';
  }
}
