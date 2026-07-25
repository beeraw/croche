<?php

declare(strict_types=1);

namespace App\Controller;

use App\Controller;
use App\Entity\User;
use App\Repository\UserRepository;
use App\Security\PinCodeThrottle;
use LogicException;
use Symfony\Bridge\Doctrine\Attribute\MapEntity;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Component\Security\Http\Authentication\AuthenticationUtils;

#[Route(name: 'security.')]
final class SecurityController extends Controller
{
    /**
     * Profile picker: large tiles, one per child. This is the front door.
     */
    #[Route('/profils', name: 'profiles')]
    public function profiles(UserRepository $repository): Response
    {
        if (null !== $this->getUser()) {
            return $this->redirectToRoute('home');
        }

        return $this->render('security/profiles.html.twig', [
            'children' => $repository->findChildren(),
        ]);
    }

    /**
     * Four-digit keypad for the chosen profile.
     */
    #[Route('/profils/{id}', name: 'pin', requirements: ['id' => Requirement::DIGITS], methods: ['GET'])]
    public function pin(
        #[MapEntity(id: 'id')]
        User $profile,
        PinCodeThrottle $throttle,
    ): Response {
        if (null !== $this->getUser()) {
            return $this->redirectToRoute('home');
        }

        if (!$profile->isChild()) {
            return $this->redirectToRoute('security.profiles');
        }

        return $this->render('security/pin.html.twig', [
            'profile' => $profile,
            'lockedSeconds' => $throttle->secondsRemaining($profile),
        ]);
    }

    /**
     * Handled entirely by App\Security\PinCodeAuthenticator.
     */
    #[Route('/profils/{id}/code', name: 'pin_check', requirements: ['id' => Requirement::DIGITS], methods: ['POST'])]
    public function pinCheck(): never
    {
        throw new LogicException('Intercepted by PinCodeAuthenticator.');
    }

    #[Route('/connexion', name: 'login')]
    public function login(AuthenticationUtils $authenticationUtils): Response
    {
        if (null !== $this->getUser()) {
            return $this->redirectToRoute('home');
        }

        return $this->render('security/login.html.twig', [
            'lastUsername' => $authenticationUtils->getLastUsername(),
            'error' => $authenticationUtils->getLastAuthenticationError(),
        ]);
    }

    /**
     * Handled by the firewall.
     */
    #[Route('/deconnexion', name: 'logout')]
    public function logout(): never
    {
        throw new LogicException('Intercepted by the logout key on the firewall.');
    }
}
