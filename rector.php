<?php

declare(strict_types=1);

use Rector\Config\RectorConfig;
use Rector\ValueObject\PhpVersion;

return RectorConfig::configure()
    ->withPaths([
        __DIR__.'/bin',
        __DIR__.'/config',
        __DIR__.'/public',
        __DIR__.'/src',
        __DIR__.'/tests',
    ])
    ->withPhpSets(php85: true)
    ->withPhpVersion(PhpVersion::PHP_85)
    // Type coverage is the one level worth raising by hand, once PHPStan is
    // green: 0 → 50 → max.
    ->withTypeCoverageLevel(0)
    ->withDeadCodeLevel(20)
    ->withCodeQualityLevel(20)
;
