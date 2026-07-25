<?php

declare(strict_types=1);

namespace App\Score;

use RuntimeException;

/**
 * Thrown when a submitted score document does not match ScoreSchema.
 */
final class ScoreContentException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly string $path = '',
    ) {
        parent::__construct($message);
    }

    public function getPath(): string
    {
        return $this->path;
    }
}
