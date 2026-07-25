<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\User;
use App\Tests\DatabaseTestCase;

/**
 * Four digits is only ten thousand combinations, so the throttle — not the
 * code length — is what actually keeps a profile shut.
 */
final class PinCodeTest extends DatabaseTestCase
{
    public function testTheRightCodeSignsTheChildIn(): void
    {
        $child = $this->createChild('aicha', '2018');

        $this->submitPin($child, '2018');

        self::assertResponseRedirects('/morceaux');
    }

    public function testTheWrongCodeDoesNot(): void
    {
        $child = $this->createChild('aicha', '2018');

        $this->submitPin($child, '9999');

        self::assertResponseRedirects('/profils/'.$child->getId());
        self::assertSame(1, $this->reload(User::class, $child->getId())->getPinFailedAttempts());
    }

    public function testTheProfileLocksItselfAfterRepeatedFailures(): void
    {
        $child = $this->createChild('aicha', '2018');

        for ($attempt = 0; $attempt < User::PIN_MAX_ATTEMPTS; ++$attempt) {
            $this->submitPin($child, '0000');
        }

        $locked = $this->reload(User::class, $child->getId());
        self::assertTrue($locked->isPinLocked(), 'The profile should be locked.');

        // Even the right code is refused while the lockout stands.
        $this->submitPin($child, '2018');
        self::assertResponseRedirects('/profils/'.$child->getId());
    }

    public function testASuccessfulSignInClearsTheCounter(): void
    {
        $child = $this->createChild('aicha', '2018');

        $this->submitPin($child, '9999');
        self::assertSame(1, $this->reload(User::class, $child->getId())->getPinFailedAttempts());

        $this->submitPin($child, '2018');
        self::assertSame(0, $this->reload(User::class, $child->getId())->getPinFailedAttempts());
    }

    public function testTheKeypadIsHiddenWhileTheProfileIsLocked(): void
    {
        $child = $this->createChild('aicha', '2018');

        for ($attempt = 0; $attempt < User::PIN_MAX_ATTEMPTS; ++$attempt) {
            $this->submitPin($child, '0000');
        }

        $crawler = $this->client->request('GET', '/profils/'.$child->getId());

        self::assertResponseIsSuccessful();
        self::assertCount(0, $crawler->filter('.pin-pad__key'));
        self::assertCount(1, $crawler->filter('.alert--error'));
    }

    public function testTheCodeIsNeverStoredInClear(): void
    {
        $child = $this->createChild('aicha', '2018');
        $stored = (string) $this->reload(User::class, $child->getId())->getPinCode();

        self::assertNotSame('2018', $stored);
        self::assertStringStartsWith('$2y$', $stored);
    }

    public function testAnAdminProfileCannotBeReachedThroughTheKeypad(): void
    {
        $admin = $this->createAdmin();

        $this->client->request('GET', '/profils/'.$admin->getId());

        self::assertResponseRedirects('/profils');
    }

    private function submitPin(User $child, string $pin): void
    {
        $crawler = $this->client->request('GET', '/profils/'.$child->getId());
        $token = $crawler->filter('input[name="_csrf_token"]')->first();

        $this->client->request('POST', '/profils/'.$child->getId().'/code', [
            '_csrf_token' => $token->count() > 0 ? (string) $token->attr('value') : '',
            'pin' => $pin,
        ]);
    }
}
