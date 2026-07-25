<?php

declare(strict_types=1);

namespace App\Entity;

use App\Interface\IdInterface;
use App\Repository\ScoreRevisionRepository;
use App\Trait\IdTrait;
use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * Snapshot of a score's previous content, written on every save.
 * Only the newest App\Score\ScoreRevisionRecorder::KEEP entries are kept.
 */
#[ORM\Entity(repositoryClass: ScoreRevisionRepository::class)]
#[ORM\Index(fields: ['score', 'createdAt'])]
class ScoreRevision implements IdInterface
{
    use IdTrait;

    #[ORM\ManyToOne(targetEntity: Score::class, inversedBy: 'revisions')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Score $score = null;

    /** @var array<string, mixed> */
    #[ORM\Column(type: Types::JSON)]
    private array $content = [];

    #[ORM\Column]
    private ?DateTimeImmutable $createdAt = null;

    public function __construct()
    {
        $this->createdAt = new DateTimeImmutable();
    }

    public function getScore(): ?Score
    {
        return $this->score;
    }

    public function setScore(?Score $score): static
    {
        $this->score = $score;

        return $this;
    }

    /**
     * @return array<string, mixed>
     */
    public function getContent(): array
    {
        return $this->content;
    }

    /**
     * @param array<string, mixed> $content
     */
    public function setContent(array $content): static
    {
        $this->content = $content;

        return $this;
    }

    public function getCreatedAt(): ?DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function setCreatedAt(?DateTimeImmutable $createdAt): static
    {
        $this->createdAt = $createdAt;

        return $this;
    }
}
