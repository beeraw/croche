<?php

declare(strict_types=1);

namespace App\Entity;

use App\Enum\AvatarIcon;
use App\Interface\TimeInterface;
use App\Repository\UserRepository;
use App\Trait\TimeTrait;
use DateTimeImmutable;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Stringable;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Validator\Constraints as Assert;

use function in_array;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: '`user`')]
#[UniqueEntity(fields: ['username'], message: 'form.username_taken')]
class User implements UserInterface, PasswordAuthenticatedUserInterface, TimeInterface, Stringable
{
    use TimeTrait;

    public const string ROLE_ADMIN = 'ROLE_ADMIN';
    public const string ROLE_CHILD = 'ROLE_CHILD';

    /** Attempts allowed before the profile locks itself for a while. */
    public const int PIN_MAX_ATTEMPTS = 5;

    #[ORM\Column(length: 60, unique: true)]
    #[Assert\NotBlank(message: 'form.username_required')]
    #[Assert\Length(min: 2, max: 60)]
    #[Assert\Regex(
        pattern: '/^[a-z0-9._-]+$/',
        message: 'form.username_format',
    )]
    private ?string $username = null;

    #[ORM\Column(length: 60)]
    #[Assert\NotBlank(message: 'form.first_name_required')]
    #[Assert\Length(min: 1, max: 60)]
    private ?string $displayName = null;

    /** @var list<string> */
    #[ORM\Column]
    private array $roles = [];

    /** Admin password. Null on child profiles, which sign in with a PIN. */
    #[ORM\Column(nullable: true)]
    private ?string $password = null;

    /** Hashed four-digit code. Null on admin profiles. */
    #[ORM\Column(nullable: true)]
    private ?string $pinCode = null;

    #[ORM\Column(length: 40, enumType: AvatarIcon::class)]
    private AvatarIcon $avatarIcon = AvatarIcon::Music;

    #[ORM\Column(options: ['default' => 0])]
    private int $pinFailedAttempts = 0;

    #[ORM\Column(nullable: true)]
    private ?DateTimeImmutable $pinLockedUntil = null;

    /** @var Collection<int, Score> */
    #[ORM\OneToMany(targetEntity: Score::class, mappedBy: 'owner', cascade: ['remove'])]
    private Collection $scores;

    public function __construct()
    {
        $this->scores = new ArrayCollection();
    }

    public function __toString(): string
    {
        return (string) $this->displayName;
    }

    public function getUsername(): ?string
    {
        return $this->username;
    }

    public function setUsername(string $username): static
    {
        $this->username = $username;

        return $this;
    }

    public function getUserIdentifier(): string
    {
        return (string) $this->username;
    }

    public function getDisplayName(): ?string
    {
        return $this->displayName;
    }

    public function setDisplayName(string $displayName): static
    {
        $this->displayName = $displayName;

        return $this;
    }

    /**
     * @return list<string>
     */
    public function getRoles(): array
    {
        $roles = $this->roles;
        $roles[] = 'ROLE_USER';

        return array_values(array_unique($roles));
    }

    /**
     * @param list<string> $roles
     */
    public function setRoles(array $roles): static
    {
        $this->roles = array_values(array_unique($roles));

        return $this;
    }

    public function isAdmin(): bool
    {
        return in_array(self::ROLE_ADMIN, $this->getRoles(), true);
    }

    public function isChild(): bool
    {
        return in_array(self::ROLE_CHILD, $this->getRoles(), true);
    }

    public function getPassword(): ?string
    {
        return $this->password;
    }

    public function setPassword(?string $password): static
    {
        $this->password = $password;

        return $this;
    }

    public function getPinCode(): ?string
    {
        return $this->pinCode;
    }

    public function setPinCode(?string $pinCode): static
    {
        $this->pinCode = $pinCode;

        return $this;
    }

    public function getAvatarIcon(): AvatarIcon
    {
        return $this->avatarIcon;
    }

    public function setAvatarIcon(AvatarIcon $avatarIcon): static
    {
        $this->avatarIcon = $avatarIcon;

        return $this;
    }

    public function getPinFailedAttempts(): int
    {
        return $this->pinFailedAttempts;
    }

    public function setPinFailedAttempts(int $pinFailedAttempts): static
    {
        $this->pinFailedAttempts = $pinFailedAttempts;

        return $this;
    }

    public function getPinLockedUntil(): ?DateTimeImmutable
    {
        return $this->pinLockedUntil;
    }

    public function setPinLockedUntil(?DateTimeImmutable $pinLockedUntil): static
    {
        $this->pinLockedUntil = $pinLockedUntil;

        return $this;
    }

    public function isPinLocked(): bool
    {
        return null !== $this->pinLockedUntil && $this->pinLockedUntil > new DateTimeImmutable();
    }

    /**
     * @return Collection<int, Score>
     */
    public function getScores(): Collection
    {
        return $this->scores;
    }

    public function addScore(Score $score): static
    {
        if (!$this->scores->contains($score)) {
            $this->scores->add($score);
            $score->setOwner($this);
        }

        return $this;
    }

    public function removeScore(Score $score): static
    {
        $this->scores->removeElement($score);

        return $this;
    }

    public function eraseCredentials(): void
    {
        // No plaintext credential is ever held on the entity.
    }
}
