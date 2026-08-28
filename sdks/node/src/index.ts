export { Hookflow } from './client';
export { HookflowError, RateLimitError, AuthenticationError, ValidationError, NotFoundError } from './errors';

// Backward-compatible aliases
export { Hookflow as WebhookPlatform } from './client';
export { HookflowError as WebhookPlatformError } from './errors';
export { verifySignature, verifyStandardWebhook, constructEvent, generateSignature } from './webhooks';
export type { WebhookHeaders, VerifyOptions } from './webhooks';
export * from './types';
