<?php

declare(strict_types=1);

namespace Hookflow\Tests;

use PHPUnit\Framework\TestCase;
use Hookflow\Hookflow;

/**
 * Regression test for the package rename (webhook-platform/php -> hookflow/php).
 * The Hookflow\ namespace was always correct; only the Packagist package
 * name changes here. This must fail loudly if either drifts.
 */
class PackageRenameTest extends TestCase
{
    public function testPackagePublishedAsHookflowPhp(): void
    {
        $composerJson = json_decode(
            file_get_contents(__DIR__ . '/../composer.json'),
            true
        );

        $this->assertSame('hookflow/php', $composerJson['name']);
    }

    public function testSmokeConstructsClientUnderNewPackageNamespace(): void
    {
        $client = new Hookflow('test_api_key');

        $this->assertInstanceOf(Hookflow::class, $client);
    }
}
