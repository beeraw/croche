<?php

declare(strict_types=1);

namespace App\Score;

use RuntimeException;

/**
 * Thrown when a submitted score document does not match ScoreSchema.
 *
 * Carries a translation key rather than a sentence: the API answers in the
 * caller's language, and the editor shows the message as-is.
 */
final class ScoreContentException extends RuntimeException
{
    /**
     * @param array<string, string|int> $parameters
     */
    public function __construct(
        private readonly string $key,
        private readonly array $parameters = [],
        private readonly string $path = '',
    ) {
        parent::__construct($key);
    }

    public function getKey(): string
    {
        return $this->key;
    }

    /**
     * @return array<string, string|int>
     */
    public function getParameters(): array
    {
        return $this->parameters;
    }

    public function getPath(): string
    {
        return $this->path;
    }
}
