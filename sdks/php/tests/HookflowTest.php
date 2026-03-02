<?php

declare(strict_types=1);

namespace Hookflow\Tests;

use PHPUnit\Framework\TestCase;
use Hookflow\Hookflow;
use Hookflow\Exception\HookflowException;
use Hookflow\Exception\AuthenticationException;
use Hookflow\Exception\ValidationException;
use Hookflow\Exception\NotFoundException;
use Hookflow\Exception\RateLimitException;

class HookflowTest extends TestCase
{
    public function testCreatesWithApiKey(): void
    {
        $client = new Hookflow('test_api_key');
        
        $this->assertInstanceOf(Hookflow::class, $client);
    }

    public function testThrowsWithoutApiKey(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('API key is required');
        
        new Hookflow('');
    }

    public function testUsesDefaultBaseUrl(): void
    {
        $client = new Hookflow('test_api_key');
        
        // We can't directly test private property, but we can verify client creates successfully
        $this->assertInstanceOf(Hookflow::class, $client);
    }

    public function testAcceptsCustomBaseUrl(): void
    {
        $client = new Hookflow(
            'test_api_key',
            'https://api.example.com/'
        );
        
        $this->assertInstanceOf(Hookflow::class, $client);
    }

    public function testAcceptsCustomTimeout(): void
    {
        $client = new Hookflow('test_api_key', 'http://localhost:8080', 60);
        
        $this->assertInstanceOf(Hookflow::class, $client);
    }

    public function testInitializesApiModules(): void
    {
        $client = new Hookflow('test_api_key');
        
        $this->assertNotNull($client->events);
        $this->assertNotNull($client->endpoints);
        $this->assertNotNull($client->subscriptions);
        $this->assertNotNull($client->deliveries);
    }
}

class GenericRequestMethodsTest extends TestCase
{
    public function testExposeGetMethod(): void
    {
        $client = new Hookflow('test_api_key');
        $this->assertTrue(method_exists($client, 'get'));
    }

    public function testExposePostMethod(): void
    {
        $client = new Hookflow('test_api_key');
        $this->assertTrue(method_exists($client, 'post'));
    }

    public function testExposePutMethod(): void
    {
        $client = new Hookflow('test_api_key');
        $this->assertTrue(method_exists($client, 'put'));
    }

    public function testExposePatchMethod(): void
    {
        $client = new Hookflow('test_api_key');
        $this->assertTrue(method_exists($client, 'patch'));
    }

    public function testExposeDeleteMethod(): void
    {
        $client = new Hookflow('test_api_key');
        $this->assertTrue(method_exists($client, 'delete'));
    }

    public function testExposeRequestMethod(): void
    {
        $client = new Hookflow('test_api_key');
        $this->assertTrue(method_exists($client, 'request'));
    }
}

class ExceptionTest extends TestCase
{
    public function testHookflowException(): void
    {
        $exception = new HookflowException('Test error', 500, 'test_code');
        
        $this->assertSame('Test error', $exception->getMessage());
        $this->assertSame(500, $exception->getStatusCode());
        $this->assertSame('test_code', $exception->getErrorCode());
    }

    public function testAuthenticationException(): void
    {
        $exception = new AuthenticationException('Invalid API key');
        
        $this->assertInstanceOf(HookflowException::class, $exception);
        $this->assertSame('Invalid API key', $exception->getMessage());
    }

    public function testValidationException(): void
    {
        $fieldErrors = ['email' => 'Invalid email', 'url' => 'Invalid URL'];
        $exception = new ValidationException('Validation failed', $fieldErrors);
        
        $this->assertInstanceOf(HookflowException::class, $exception);
        $this->assertSame('Validation failed', $exception->getMessage());
        $this->assertSame($fieldErrors, $exception->getFieldErrors());
    }

    public function testNotFoundException(): void
    {
        $exception = new NotFoundException('Resource not found');
        
        $this->assertInstanceOf(HookflowException::class, $exception);
        $this->assertSame('Resource not found', $exception->getMessage());
    }

    public function testRateLimitException(): void
    {
        $rateLimitInfo = ['limit' => 100, 'remaining' => 0, 'reset' => 1700000000000];
        $exception = new RateLimitException('Rate limit exceeded', $rateLimitInfo);
        
        $this->assertInstanceOf(HookflowException::class, $exception);
        $this->assertSame('Rate limit exceeded', $exception->getMessage());
        $this->assertSame($rateLimitInfo, $exception->getRateLimitInfo());
    }
}
