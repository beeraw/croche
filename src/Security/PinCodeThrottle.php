<?php

declare(strict_types=1);

namespace App\Security;

use App\Entity\User;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;

use function count;
use function sprintf;

/**
 * Brute-force protection for the four-digit child PIN.
 *
 * Ten thousand combinations is not a lot, so the throttle is the real defence,
 * not the code length. It lives on the User row rather than in a rate limiter
 * keyed by IP: the limit must follow the profile, and survive switching device
 * or network.
 */
final readonly class PinCodeThrottle
{
    /** Lockout duration per step, in seconds: 1 min, 5 min, 15 min, then 1 h. */
    private const array LOCKOUT_STEPS = [60, 300, 900, 3600];

    public function __construct(private EntityManagerInterface $entityManager)
    {
    }

    public function isLocked(User $user): bool
    {
        return $user->isPinLocked();
    }

    /**
     * Seconds left before the profile can try again, 0 when it is not locked.
     */
    public function secondsRemaining(User $user): int
    {
        $until = $user->getPinLockedUntil();

        if (null === $until) {
            return 0;
        }

        return max(0, $until->getTimestamp() - time());
    }

    public function registerFailure(User $user): void
    {
        $attempts = $user->getPinFailedAttempts() + 1;
        $user->setPinFailedAttempts($attempts);

        if ($attempts >= User::PIN_MAX_ATTEMPTS) {
            // Each further block of failures lengthens the wait.
            $step = intdiv($attempts - User::PIN_MAX_ATTEMPTS, User::PIN_MAX_ATTEMPTS);
            $delay = self::LOCKOUT_STEPS[min($step, count(self::LOCKOUT_STEPS) - 1)];

            $user->setPinLockedUntil(new DateTimeImmutable(sprintf('+%d seconds', $delay)));
        }

        $this->entityManager->flush();
    }

    public function registerSuccess(User $user): void
    {
        if (0 === $user->getPinFailedAttempts() && null === $user->getPinLockedUntil()) {
            return;
        }

        $user->setPinFailedAttempts(0);
        $user->setPinLockedUntil(null);
        $this->entityManager->flush();
    }

    /**
     * Used by the admin dashboard to free a profile that locked itself out.
     */
    public function reset(User $user): void
    {
        $this->registerSuccess($user);
    }
}
