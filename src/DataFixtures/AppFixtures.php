<?php

declare(strict_types=1);

namespace App\DataFixtures;

use App\Entity\Score;
use App\Entity\User;
use App\Enum\AvatarIcon;
use App\Score\ScoreSchema;
use App\Security\PinCodeHasher;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Demo data only — fictional first names, no real person's information.
 */
class AppFixtures extends Fixture
{
    public function __construct(
        private readonly UserPasswordHasherInterface $hasher,
        private readonly PinCodeHasher $pinHasher,
    ) {
    }

    public function load(ObjectManager $manager): void
    {
        $admin = (new User())
            ->setUsername('admin')
            ->setDisplayName('Administration')
            ->setRoles([User::ROLE_ADMIN])
            ->setAvatarIcon(AvatarIcon::Palette);
        $admin->setPassword($this->hasher->hashPassword($admin, 'admin'));
        $manager->persist($admin);

        $child = (new User())
            ->setUsername('aicha')
            ->setDisplayName('Aïcha')
            ->setRoles([User::ROLE_CHILD])
            ->setAvatarIcon(AvatarIcon::Cat);
        $child->setPinCode($this->pinHasher->hash($child, '2018'));
        $manager->persist($child);

        $manager->persist(
            (new Score())
                ->setOwner($child)
                ->setTitle('Twinkle little star')
                ->setContent($this->twinkle())
        );

        $manager->persist(
            (new Score())
                ->setOwner($child)
                ->setTitle('My first scale')
                ->setContent($this->scale())
        );

        $manager->flush();
    }

    /**
     * The opening phrase: melody in the treble, chord roots held in the bass.
     *
     * @return array<string, mixed>
     */
    private function twinkle(): array
    {
        $treble = [
            $this->measure([
                $this->note('c/4', 'q'),
                $this->note('c/4', 'q'),
                $this->note('g/4', 'q'),
                $this->note('g/4', 'q'),
            ]),
            $this->measure([
                $this->note('a/4', 'q'),
                $this->note('a/4', 'q'),
                $this->note('g/4', 'h'),
            ]),
            $this->measure([
                $this->note('f/4', 'q'),
                $this->note('f/4', 'q'),
                $this->note('e/4', 'q'),
                $this->note('e/4', 'q'),
            ]),
            $this->measure([
                $this->note('d/4', 'q'),
                $this->note('d/4', 'q'),
                $this->note('c/4', 'h'),
            ]),
        ];

        // I I, IV I, IV I, V I — the roots a beginner's left hand can hold.
        $bass = [
            $this->measure([$this->note('c/3', 'h'), $this->note('c/3', 'h')]),
            $this->measure([$this->note('f/2', 'h'), $this->note('c/3', 'h')]),
            $this->measure([$this->note('f/2', 'h'), $this->note('c/3', 'h')]),
            $this->measure([$this->note('g/2', 'h'), $this->note('c/3', 'h')]),
        ];

        return $this->document($treble, $bass, tempo: 96);
    }

    /**
     * One octave up and back down in eighths, over a held bass note.
     *
     * @return array<string, mixed>
     */
    private function scale(): array
    {
        $up = ['c/4', 'd/4', 'e/4', 'f/4', 'g/4', 'a/4', 'b/4', 'c/5'];
        $down = array_reverse($up);

        $treble = [
            $this->measure(array_map(fn (string $key): array => $this->note($key, '8'), $up)),
            $this->measure(array_map(fn (string $key): array => $this->note($key, '8'), $down)),
        ];

        $bass = [
            $this->measure([$this->note('c/3', 'w')]),
            $this->measure([$this->note('c/3', 'w')]),
        ];

        return $this->document($treble, $bass, tempo: 72);
    }

    /**
     * @param list<array<string, mixed>> $trebleMeasures
     * @param list<array<string, mixed>> $bassMeasures
     *
     * @return array<string, mixed>
     */
    private function document(array $trebleMeasures, array $bassMeasures, int $tempo): array
    {
        return [
            'schemaVersion' => ScoreSchema::VERSION,
            'keySignature' => 'C',
            'timeSignature' => '4/4',
            'tempo' => $tempo,
            'staves' => [
                ['clef' => 'treble', 'measures' => $trebleMeasures],
                ['clef' => 'bass', 'measures' => $bassMeasures],
            ],
        ];
    }

    /**
     * @param list<array<string, mixed>> $notes
     *
     * @return array<string, mixed>
     */
    private function measure(array $notes): array
    {
        return ['notes' => $notes];
    }

    /**
     * @return array<string, mixed>
     */
    private function note(string $key, string $duration): array
    {
        return [
            'keys' => [$key],
            'duration' => $duration,
            'accidental' => null,
            'rest' => false,
        ];
    }
}
