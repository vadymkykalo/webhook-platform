<?php

declare(strict_types=1);

namespace WebhookPlatform\Tests;

use PHPUnit\Framework\TestCase;
use WebhookPlatform\WebhookPlatform;
use WebhookPlatform\Exception\WebhookPlatformException;
use WebhookPlatform\Exception\AuthenticationException;
use WebhookPlatform\Exception\ValidationException;
use WebhookPlatform\Exception\NotFoundException;
use WebhookPlatform\Exception\RateLimitException;

class WebhookPlatformTest extends TestCase
{
    public function testCreatesWithApiKey(): void
    {
        $client = new WebhookPlatform('test_api_key');
        
        $this->assertInstanceOf(WebhookPlatform::class, $client);
    }

    public function testThrowsWithoutApiKey(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('API key is required');
        
        new WebhookPlatform('');
    }

    public function testUsesDefaultBaseUrl(): void
    {
        $client = new WebhookPlatform('test_api_key');
        
        // We can't directly test private property, but we can verify client creates successfully
        $this->assertInstanceOf(WebhookPlatform::class, $client);
    }

    public function testAcceptsCustomBaseUrl(): void
    {
        $client = new WebhookPlatform(
            'test_api_key',
            'https://api.example.com/'
        );
        
        $this->assertInstanceOf(WebhookPlatform::class, $client);
    }

    public function testAcceptsCustomTimeout(): void
    {
        $client = new WebhookPlatform('test_api_key', 'http://localhost:8080', 60);
        
        $this->assertInstanceOf(WebhookPlatform::class, $client);
    }

    public function testInitializesApiModules(): void
    {
        $client = new WebhookPlatform('test_api_key');
        
        $this->assertNotNull($client->events);
        $this->assertNotNull($client->endpoints);
        $this->assertNotNull($client->subscriptions);
        $this->assertNotNull($client->deliveries);
    }
}

class ExceptionTest extends TestCase
{
    public function testWebhookPlatformException(): void
    {
        $exception = new WebhookPlatformException('Test error', 500, 'test_code');
        
        $this->assertSame('Test error', $exception->getMessage());
        $this->assertSame(500, $exception->getStatusCode());
        $this->assertSame('test_code', $exception->getErrorCode());
    }

    public function testAuthenticationException(): void
    {
        $exception = new AuthenticationException('Invalid API key');
        
        $this->assertInstanceOf(WebhookPlatformException::class, $exception);
        $this->assertSame('Invalid API key', $exception->getMessage());
    }

    public function testValidationException(): void
    {
        $fieldErrors = ['email' => 'Invalid email', 'url' => 'Invalid URL'];
        $exception = new ValidationException('Validation failed', $fieldErrors);
        
        $this->assertInstanceOf(WebhookPlatformException::class, $exception);
        $this->assertSame('Validation failed', $exception->getMessage());
        $this->assertSame($fieldErrors, $exception->getFieldErrors());
    }

    public function testNotFoundException(): void
    {
        $exception = new NotFoundException('Resource not found');
        
        $this->assertInstanceOf(WebhookPlatformException::class, $exception);
        $this->assertSame('Resource not found', $exception->getMessage());
    }

    public function testRateLimitException(): void
    {
        $rateLimitInfo = ['limit' => 100, 'remaining' => 0, 'reset' => 1700000000000];
        $exception = new RateLimitException('Rate limit exceeded', $rateLimitInfo);
        
        $this->assertInstanceOf(WebhookPlatformException::class, $exception);
        $this->assertSame('Rate limit exceeded', $exception->getMessage());
        $this->assertSame($rateLimitInfo, $exception->getRateLimitInfo());
    }
}
