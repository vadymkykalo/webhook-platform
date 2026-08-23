<?php

declare(strict_types=1);

namespace Hookflow\Tests;

use PHPUnit\Framework\TestCase;
use Hookflow\Hookflow;

/**
 * Guards the published identity of this SDK: the Packagist package is
 * webhook-platform/php while the PHP namespace is Hookflow\. The two names
 * differ on purpose, so this fails loudly if either drifts.
 */
class PackageIdentityTest extends TestCase
{
    public function testPackagePublishedAsWebhookPlatformPhp(): void
    {
        $composerJson = json_decode(
            file_get_contents(__DIR__ . '/../composer.json'),
            true
        );

        $this->assertSame('webhook-platform/php', $composerJson['name']);
    }

    public function testSmokeConstructsClientUnderHookflowNamespace(): void
    {
        $client = new Hookflow('test_api_key');

        $this->assertInstanceOf(Hookflow::class, $client);
    }
}
