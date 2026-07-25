<?php

declare(strict_types=1);

namespace App\Score;

use App\Entity\Score;
use App\Entity\ScoreRevision;

use const DATE_ATOM;

/**
 * Turns entities into the JSON shapes the API returns.
 *
 * Hand-written rather than serializer-driven: three shapes, all tiny, and it
 * keeps the payload explicit.
 */
final class ScorePresenter
{
    /**
     * @return array<string, mixed>
     */
    public function score(Score $score, bool $withContent = true): array
    {
        $payload = [
            'id' => $score->getId(),
            'title' => $score->getTitle(),
            'owner' => [
                'id' => $score->getOwner()?->getId(),
                'displayName' => $score->getOwner()?->getDisplayName(),
            ],
            'measureCount' => $score->getMeasureCount(),
            'createdAt' => $score->getCreatedAt()?->format(DATE_ATOM),
            'updatedAt' => $score->getUpdatedAt()?->format(DATE_ATOM),
        ];

        if ($withContent) {
            $payload['content'] = $score->getContent();
        }

        return $payload;
    }

    /**
     * @param iterable<Score> $scores
     *
     * @return list<array<string, mixed>>
     */
    public function collection(iterable $scores, bool $withContent = false): array
    {
        $payload = [];

        foreach ($scores as $score) {
            $payload[] = $this->score($score, $withContent);
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    public function revision(ScoreRevision $revision, bool $withContent = false): array
    {
        $payload = [
            'id' => $revision->getId(),
            'createdAt' => $revision->getCreatedAt()?->format(DATE_ATOM),
        ];

        if ($withContent) {
            $payload['content'] = $revision->getContent();
        }

        return $payload;
    }
}
