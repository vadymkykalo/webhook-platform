<?php

declare(strict_types=1);

namespace WebhookPlatform\Exception;

class NotFoundException extends WebhookPlatformException
{
    public function __construct(string $message = 'Resource not found')
    {
        parent::__construct($message, 404, 'not_found');
    }
}
