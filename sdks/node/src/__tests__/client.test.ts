import { Hookflow } from '../client';
import { HookflowError, AuthenticationError, ValidationError } from '../errors';

describe('Hookflow Client', () => {
  describe('constructor', () => {
    it('should create client with API key', () => {
      const client = new Hookflow({ apiKey: 'test_api_key' });
      expect(client).toBeInstanceOf(Hookflow);
    });

    it('should throw error without API key', () => {
      expect(() => new Hookflow({ apiKey: '' })).toThrow('API key is required');
    });

    it('should use default base URL', () => {
      const client = new Hookflow({ apiKey: 'test_api_key' });
      expect(client).toBeDefined();
    });

    it('should accept custom base URL', () => {
      const client = new Hookflow({
        apiKey: 'test_api_key',
        baseUrl: 'https://api.example.com',
      });
      expect(client).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const client = new Hookflow({
        apiKey: 'test_api_key',
        timeout: 60000,
      });
      expect(client).toBeDefined();
    });

    it('should initialize all API modules', () => {
      const client = new Hookflow({ apiKey: 'test_api_key' });
      expect(client.events).toBeDefined();
      expect(client.endpoints).toBeDefined();
      expect(client.subscriptions).toBeDefined();
      expect(client.deliveries).toBeDefined();
    });
  });
});

describe('Error Classes', () => {
  describe('HookflowError', () => {
    it('should have correct properties', () => {
      const error = new HookflowError('Test error', 500, 'test_code');
      expect(error.message).toBe('Test error');
      expect(error.status).toBe(500);
      expect(error.code).toBe('test_code');
      expect(error.name).toBe('HookflowError');
    });
  });

  describe('AuthenticationError', () => {
    it('should have correct defaults', () => {
      const error = new AuthenticationError();
      expect(error.message).toBe('Invalid API key');
      expect(error.status).toBe(401);
      expect(error.code).toBe('authentication_error');
      expect(error.name).toBe('AuthenticationError');
    });

    it('should accept custom message', () => {
      const error = new AuthenticationError('Custom auth error');
      expect(error.message).toBe('Custom auth error');
    });
  });

  describe('ValidationError', () => {
    it('should have field errors', () => {
      const fieldErrors = { email: 'Invalid email', url: 'Invalid URL' };
      const error = new ValidationError('Validation failed', fieldErrors);
      expect(error.message).toBe('Validation failed');
      expect(error.status).toBe(400);
      expect(error.code).toBe('validation_error');
      expect(error.fieldErrors).toEqual(fieldErrors);
    });

    it('should default to empty field errors', () => {
      const error = new ValidationError('Validation failed');
      expect(error.fieldErrors).toEqual({});
    });
  });
});
