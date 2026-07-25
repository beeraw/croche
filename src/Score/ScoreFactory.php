<?php

declare(strict_types=1);

namespace App\Score;

use App\Entity\Score;
use App\Entity\User;
use App\Repository\ScoreRepository;
use Symfony\Contracts\Translation\TranslatorInterface;

use function sprintf;

final readonly class ScoreFactory
{
    public function __construct(
        private ScoreRepository $repository,
        private TranslatorInterface $translator,
    ) {
    }

    public function createBlank(User $owner, ?string $title = null): Score
    {
        return new Score()
            ->setOwner($owner)
            ->setTitle($title ?? $this->nextUntitledName($owner))
            ->setContent(ScoreSchema::blankContent());
    }

    /**
     * A copy under a "… (2)" style name, keeping the original untouched.
     */
    public function duplicate(Score $source): Score
    {
        return new Score()
            ->setOwner($source->getOwner())
            ->setTitle($this->nextCopyName($source))
            ->setContent($source->getContent());
    }

    private function nextUntitledName(User $owner): string
    {
        $base = $this->translator->trans('score.untitled');
        $count = $this->repository->countByOwnerAndTitlePrefix($owner, $base);

        return 0 === $count ? $base : sprintf('%s %d', $base, $count + 1);
    }

    private function nextCopyName(Score $source): string
    {
        $owner = $source->getOwner();
        $base = sprintf('%s (%s', (string) $source->getTitle(), $this->translator->trans('score.copy_suffix'));

        if (!$owner instanceof User) {
            return $base.')';
        }

        $count = $this->repository->countByOwnerAndTitlePrefix($owner, $base);
        $title = 0 === $count ? $base.')' : sprintf('%s %d)', $base, $count + 1);

        return mb_substr($title, 0, 120);
    }
}
