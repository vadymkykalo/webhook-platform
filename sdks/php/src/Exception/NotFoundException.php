<?php

declare(strict_types=1);

namespace Hookflow\Exception;

class NotFoundException extends HookflowException
{
    public function __construct(string $message = 'Resource not found')
    {
        parent::__construct($message, 404, 'not_found');
    }
}
