<?php

declare(strict_types=1);

namespace Hookflow\Exception;

class AuthenticationException extends HookflowException
{
    public function __construct(string $message = 'Invalid API key')
    {
        parent::__construct($message, 401, 'authentication_error');
    }
}
