<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\Score;
use App\Entity\ScoreRevision;
use App\Entity\User;
use App\Score\ScoreRevisionRecorder;
use App\Score\ScoreSchema;
use App\Tests\DatabaseTestCase;

/**
 * The revision history is the safety net: if a passage disappears by accident,
 * it has to still be there. These tests guard the two rules that make it work —
 * a snapshot on every real change, and a hard cap on how many are kept.
 */
final class ScoreRevisionTest extends DatabaseTestCase
{
    public function testASaveSnapshotsThePreviousContent(): void
    {
        $score = $this->score();
        $recorder = $this->recorder();

        $original = $score->getContent();
        $recorded = $recorder->record($score, ScoreSchema::blankContent(5));
        $score->setContent(ScoreSchema::blankContent(5));
        $this->manager()->flush();

        self::assertTrue($recorded);
        self::assertCount(1, $this->reload(Score::class, $score->getId())->getRevisions());
        self::assertSame(
            $original,
            $this->reload(Score::class, $score->getId())->getRevisions()->first()->getContent(),
        );
    }

    public function testAnUnchangedSaveRecordsNothing(): void
    {
        $score = $this->score();

        self::assertFalse($this->recorder()->record($score, $score->getContent()));
        self::assertCount(0, $this->reload(Score::class, $score->getId())->getRevisions());
    }

    public function testOnlyTheNewestRevisionsAreKept(): void
    {
        $score = $this->score();
        $recorder = $this->recorder();
        $keep = ScoreRevisionRecorder::KEEP;

        for ($tempo = 60; $tempo < 60 + $keep + 7; ++$tempo) {
            $content = ScoreSchema::blankContent();
            $content['tempo'] = $tempo;

            $recorder->record($score, $content);
            $score->setContent($content);
            $this->manager()->flush();
            $recorder->purge($score);
        }

        $this->manager()->clear();
        self::assertCount($keep, $this->reload(Score::class, $score->getId())->getRevisions());
    }

    public function testDeletingAScoreTakesItsRevisionsWithIt(): void
    {
        $score = $this->score();
        $recorder = $this->recorder();

        $recorder->record($score, ScoreSchema::blankContent(3));
        $score->setContent(ScoreSchema::blankContent(3));
        $this->manager()->flush();

        $id = $score->getId();
        $this->manager()->remove($score);
        $this->manager()->flush();

        $remaining = $this->manager()
            ->getRepository(ScoreRevision::class)
            ->count(['score' => $id]);

        self::assertSame(0, $remaining);
    }

    public function testDeletingAProfileTakesTheirScoresWithIt(): void
    {
        $childId = $this->createChild()->getId();
        $scoreId = $this->score($this->reload(User::class, $childId))->getId();

        // Re-read the profile the way a real request would. Freshly created
        // entities carry an empty in-memory collection, which would make the
        // cascade look like it worked when it had simply found nothing.
        $this->manager()->clear();

        $this->manager()->remove($this->reload(User::class, $childId));
        $this->manager()->flush();

        self::assertNull($this->manager()->find(Score::class, $scoreId));
    }

    private function recorder(): ScoreRevisionRecorder
    {
        return static::getContainer()->get(ScoreRevisionRecorder::class);
    }

    private function score(?User $owner = null): Score
    {
        $score = new Score()
            ->setOwner($owner ?? $this->createChild())
            ->setTitle('A piece')
            ->setContent(ScoreSchema::blankContent());

        $this->manager()->persist($score);
        $this->manager()->flush();

        return $score;
    }
}
