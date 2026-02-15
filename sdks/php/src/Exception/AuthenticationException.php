<?php

declare(strict_types=1);

namespace WebhookPlatform\Exception;

class AuthenticationException extends WebhookPlatformException
{
    public function __construct(string $message = 'Invalid API key')
    {
        parent::__construct($message, 401, 'authentication_error');
    }
}
