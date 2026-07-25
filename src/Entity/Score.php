<?php

declare(strict_types=1);

namespace App\Entity;

use App\Interface\TimeInterface;
use App\Repository\ScoreRepository;
use App\Trait\TimeTrait;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Stringable;
use Symfony\Component\Validator\Constraints as Assert;

use function count;
use function is_array;

/**
 * A score is a document, not a set of rows: the notes live in the JSON column.
 * See App\Score\ScoreContentValidator for the shape the column must hold.
 */
#[ORM\Entity(repositoryClass: ScoreRepository::class)]
#[ORM\Index(fields: ['owner', 'updatedAt'])]
class Score implements TimeInterface, Stringable
{
    use TimeTrait;

    #[ORM\ManyToOne(targetEntity: User::class, inversedBy: 'scores')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?User $owner = null;

    #[ORM\Column(length: 120)]
    #[Assert\NotBlank(message: 'form.title_required')]
    #[Assert\Length(max: 120)]
    private ?string $title = null;

    /** @var array<string, mixed> */
    #[ORM\Column(type: Types::JSON)]
    private array $content = [];

    /** @var Collection<int, ScoreRevision> */
    #[ORM\OneToMany(
        targetEntity: ScoreRevision::class,
        mappedBy: 'score',
        cascade: ['persist', 'remove'],
        orphanRemoval: true,
    )]
    #[ORM\OrderBy(['createdAt' => 'DESC', 'id' => 'DESC'])]
    private Collection $revisions;

    public function __construct()
    {
        $this->revisions = new ArrayCollection();
    }

    public function __toString(): string
    {
        return (string) $this->title;
    }

    public function getOwner(): ?User
    {
        return $this->owner;
    }

    public function setOwner(?User $owner): static
    {
        $this->owner = $owner;

        return $this;
    }

    public function getTitle(): ?string
    {
        return $this->title;
    }

    public function setTitle(string $title): static
    {
        $this->title = $title;

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

    /**
     * @return Collection<int, ScoreRevision>
     */
    public function getRevisions(): Collection
    {
        return $this->revisions;
    }

    public function addRevision(ScoreRevision $revision): static
    {
        if (!$this->revisions->contains($revision)) {
            $this->revisions->add($revision);
            $revision->setScore($this);
        }

        return $this;
    }

    public function removeRevision(ScoreRevision $revision): static
    {
        $this->revisions->removeElement($revision);

        return $this;
    }

    /**
     * Both staves always hold the same number of measures, so either one answers.
     */
    public function getMeasureCount(): int
    {
        $staves = $this->content['staves'] ?? [];

        if (!is_array($staves) || [] === $staves) {
            return 0;
        }

        $measures = $staves[0]['measures'] ?? [];

        return is_array($measures) ? count($measures) : 0;
    }
}
