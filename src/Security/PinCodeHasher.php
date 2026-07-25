<?php

declare(strict_types=1);

namespace App\Security;

use App\Entity\User;
use Symfony\Component\PasswordHasher\Hasher\PasswordHasherFactoryInterface;

/**
 * Hashes and verifies the child's four-digit code.
 *
 * UserPasswordHasherInterface always reads User::getPassword(), which is null
 * on a child profile, so verification has to go through the hasher factory and
 * compare against getPinCode() explicitly.
 */
final readonly class PinCodeHasher
{
    public function __construct(private PasswordHasherFactoryInterface $factory)
    {
    }

    public function hash(User $user, string $pin): string
    {
        return $this->factory->getPasswordHasher($user)->hash($pin);
    }

    public function verify(User $user, string $pin): bool
    {
        $hash = $user->getPinCode();

        if (null === $hash) {
            return false;
        }

        return $this->factory->getPasswordHasher($user)->verify($hash, $pin);
    }
}
