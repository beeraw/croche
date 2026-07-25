<?php

declare(strict_types=1);

namespace App\Score;

use App\Entity\Score;
use App\Entity\ScoreRevision;
use App\Repository\ScoreRevisionRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Keeps a rolling window of previous versions of a score.
 *
 * This is the safety net: if a whole passage disappears by accident, the admin
 * can restore it from the dashboard.
 */
final readonly class ScoreRevisionRecorder
{
    public const int KEEP = 20;

    public function __construct(
        private EntityManagerInterface $entityManager,
        private ScoreRevisionRepository $repository,
    ) {
    }

    /**
     * Snapshots the score's *current* content before it is overwritten.
     *
     * @param array<string, mixed> $newContent
     *
     * @return bool whether a revision was actually written
     */
    public function record(Score $score, array $newContent): bool
    {
        $previous = $score->getContent();

        // Autosave fires often; an unchanged document is not worth a revision.
        if ([] === $previous || $previous === $newContent) {
            return false;
        }

        $revision = new ScoreRevision()
            ->setScore($score)
            ->setContent($previous);

        $score->addRevision($revision);
        $this->entityManager->persist($revision);

        return true;
    }

    /**
     * Drops everything past the newest KEEP revisions. Call after flushing.
     */
    public function purge(Score $score): int
    {
        return $this->repository->purgeBeyond($score, self::KEEP);
    }
}
