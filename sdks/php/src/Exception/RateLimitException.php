<?php

declare(strict_types=1);

namespace WebhookPlatform\Exception;

class RateLimitException extends WebhookPlatformException
{
    private array $rateLimitInfo;

    public function __construct(string $message, array $rateLimitInfo)
    {
        parent::__construct($message, 429, 'rate_limit_exceeded');
        $this->rateLimitInfo = $rateLimitInfo;
    }

    public function getRateLimitInfo(): array
    {
        return $this->rateLimitInfo;
    }

    public function getRetryAfterMs(): int
    {
        $now = (int) (microtime(true) * 1000);
        return max(0, $this->rateLimitInfo['reset'] - $now);
    }
}
