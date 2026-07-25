<?php

declare(strict_types=1);

namespace App\Security;

use App\Entity\User;
use App\Repository\UserRepository;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Generator\UrlGeneratorInterface;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAuthenticationException;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\CsrfTokenBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Credentials\CustomCredentials;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;

/**
 * Child sign-in: pick a profile tile, then tap a four-digit code.
 *
 * The code is hashed with the same hasher as passwords, and every attempt goes
 * through PinCodeThrottle so the profile locks itself after repeated failures.
 */
final class PinCodeAuthenticator extends AbstractAuthenticator
{
    public const string CHECK_ROUTE = 'security.pin_check';

    public function __construct(
        private readonly UserRepository $repository,
        private readonly PinCodeHasher $hasher,
        private readonly PinCodeThrottle $throttle,
        private readonly UrlGeneratorInterface $urlGenerator,
    ) {
    }

    public function supports(Request $request): ?bool
    {
        return self::CHECK_ROUTE === $request->attributes->get('_route')
            && $request->isMethod('POST');
    }

    public function authenticate(Request $request): Passport
    {
        $user = $this->resolveProfile($request);
        $pin = (string) $request->request->get('pin', '');

        if ($this->throttle->isLocked($user)) {
            throw new CustomUserMessageAuthenticationException('security.pin_locked');
        }

        if (1 !== preg_match('/^\d{4}$/', $pin)) {
            throw new CustomUserMessageAuthenticationException('security.pin_length');
        }

        $badge = new UserBadge(
            $user->getUserIdentifier(),
            static fn (): User => $user,
        );

        $credentials = new CustomCredentials(
            function (string $candidate, User $subject): bool {
                if (!$this->hasher->verify($subject, $candidate)) {
                    $this->throttle->registerFailure($subject);

                    return false;
                }

                $this->throttle->registerSuccess($subject);

                return true;
            },
            $pin,
        );

        return new Passport($badge, $credentials, [
            new CsrfTokenBadge('pin_code', (string) $request->request->get('_csrf_token')),
        ]);
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        return new RedirectResponse($this->urlGenerator->generate('score.index'));
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): ?Response
    {
        $request->getSession()->getFlashBag()->add('error', $this->humanise($request, $exception));

        $profileId = $request->attributes->get('id');

        if (null === $profileId) {
            return new RedirectResponse($this->urlGenerator->generate('security.profiles'));
        }

        return new RedirectResponse(
            $this->urlGenerator->generate('security.pin', ['id' => $profileId]),
        );
    }

    private function resolveProfile(Request $request): User
    {
        $id = $request->attributes->getInt('id');
        $user = $id > 0 ? $this->repository->find($id) : null;

        // Same message either way: never reveal which profile ids exist.
        if (!$user instanceof User || !$user->isChild() || null === $user->getPinCode()) {
            throw new CustomUserMessageAuthenticationException('security.pin_unknown_profile');
        }

        return $user;
    }

    private function humanise(Request $request, AuthenticationException $exception): string
    {
        if ($exception instanceof CustomUserMessageAuthenticationException) {
            return $exception->getMessageKey();
        }

        $id = $request->attributes->getInt('id');
        $user = $id > 0 ? $this->repository->find($id) : null;

        if ($user instanceof User && $this->throttle->isLocked($user)) {
            return 'security.pin_locked';
        }

        return 'security.pin_wrong';
    }
}
