<?php

declare(strict_types=1);

namespace WebhookPlatform\Exception;

class WebhookPlatformException extends \Exception
{
    protected int $statusCode;
    protected ?string $errorCode;

    public function __construct(string $message, int $statusCode = 0, ?string $errorCode = null)
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
        $this->errorCode = $errorCode;
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }

    public function getErrorCode(): ?string
    {
        return $this->errorCode;
    }
}
