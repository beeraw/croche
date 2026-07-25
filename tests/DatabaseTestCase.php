<?php

declare(strict_types=1);

namespace App\Tests;

use App\Entity\User;
use App\Enum\AvatarIcon;
use App\Security\PinCodeHasher;
use Doctrine\DBAL\Platforms\SQLitePlatform;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

use function sprintf;

/**
 * Base for tests that need a database.
 *
 * Each test gets a fresh in-memory SQLite schema built from the mapping, so
 * they are isolated from one another and from any real database.
 */
abstract class DatabaseTestCase extends WebTestCase
{
    protected KernelBrowser $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();

        $manager = $this->manager();
        $tool = new SchemaTool($manager);
        $metadata = $manager->getMetadataFactory()->getAllMetadata();
        $tool->dropSchema($metadata);
        $tool->createSchema($metadata);
    }

    /**
     * Always the *current* manager: the kernel reboots between requests, and a
     * handle captured in setUp would be pointing at a dead container.
     */
    protected function manager(): EntityManagerInterface
    {
        $manager = static::getContainer()->get(EntityManagerInterface::class);

        // SQLite ignores foreign keys unless asked, which would quietly hide
        // the ON DELETE CASCADE rules that MariaDB does enforce in production.
        if ($manager->getConnection()->getDatabasePlatform() instanceof SQLitePlatform) {
            $manager->getConnection()->executeStatement('PRAGMA foreign_keys = ON');
        }

        return $manager;
    }

    /**
     * Re-reads an entity through the current manager, by id.
     *
     * @template T of object
     *
     * @param class-string<T> $class
     *
     * @return T
     */
    protected function reload(string $class, ?int $id): object
    {
        $entity = $this->manager()->find($class, $id);

        self::assertNotNull($entity, sprintf('%s #%s vanished.', $class, $id ?? 'null'));

        return $entity;
    }

    protected function createChild(string $username = 'child', string $pin = '1234'): User
    {
        $user = (new User())
            ->setUsername($username)
            ->setDisplayName(ucfirst($username))
            ->setRoles([User::ROLE_CHILD])
            ->setAvatarIcon(AvatarIcon::Cat);

        $hasher = static::getContainer()->get(PinCodeHasher::class);
        $user->setPinCode($hasher->hash($user, $pin));

        $this->manager()->persist($user);
        $this->manager()->flush();

        return $user;
    }

    protected function createAdmin(string $username = 'admin', string $password = 'admin'): User
    {
        $user = (new User())
            ->setUsername($username)
            ->setDisplayName('Administration')
            ->setRoles([User::ROLE_ADMIN])
            ->setAvatarIcon(AvatarIcon::Palette);

        $hasher = static::getContainer()->get(UserPasswordHasherInterface::class);
        $user->setPassword($hasher->hashPassword($user, $password));

        $this->manager()->persist($user);
        $this->manager()->flush();

        return $user;
    }
}
