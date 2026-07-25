<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Controller;
use App\Entity\User;
use App\Form\ChildProfileType;
use App\Form\PinResetType;
use App\Repository\UserRepository;
use App\Security\PinCodeHasher;
use App\Security\PinCodeThrottle;
use Symfony\Bridge\Doctrine\Attribute\MapEntity;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Contracts\Translation\TranslatorInterface;

#[Route('/admin/profils', name: 'admin.user.')]
#[IsGranted(User::ROLE_ADMIN)]
final class UserController extends Controller
{
    #[Route('', name: 'index', methods: ['GET'])]
    public function index(UserRepository $repository): Response
    {
        return $this->render('admin/user/index.html.twig', [
            'users' => $repository->findAllOrdered(),
        ]);
    }

    #[Route('/nouveau', name: 'create', methods: ['GET', 'POST'])]
    public function create(Request $request, PinCodeHasher $hasher, TranslatorInterface $translator): Response
    {
        $profile = (new User())->setRoles([User::ROLE_CHILD]);
        $form = $this->createForm(ChildProfileType::class, $profile, ['require_pin' => true])
            ->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            /** @var string $pin */
            $pin = $form->get('pin')->getData();
            $profile->setPinCode($hasher->hash($profile, $pin));

            $this->persistAndFlush($profile);
            $this->addFlash('success', $translator->trans('admin.flash.profile_created', ['%name%' => (string) $profile->getDisplayName()]));

            return $this->redirectToRoute('admin.user.index');
        }

        return $this->render('admin/user/create.html.twig', ['form' => $form]);
    }

    #[Route('/{id}/modifier', name: 'edit', requirements: ['id' => Requirement::DIGITS], methods: ['GET', 'POST'])]
    public function edit(
        #[MapEntity(id: 'id')]
        User $profile,
        Request $request,
        TranslatorInterface $translator,
    ): Response {
        $form = $this->createForm(ChildProfileType::class, $profile)->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $this->entityManager->flush();
            $this->addFlash('success', $translator->trans('admin.flash.profile_updated', ['%name%' => (string) $profile->getDisplayName()]));

            return $this->redirectToRoute('admin.user.index');
        }

        return $this->render('admin/user/edit.html.twig', [
            'form' => $form,
            'profile' => $profile,
        ]);
    }

    #[Route('/{id}/code', name: 'reset_pin', requirements: ['id' => Requirement::DIGITS], methods: ['GET', 'POST'])]
    public function resetPin(
        #[MapEntity(id: 'id')]
        User $profile,
        Request $request,
        PinCodeHasher $hasher,
        PinCodeThrottle $throttle,
        TranslatorInterface $translator,
    ): Response {
        if (!$profile->isChild()) {
            $this->addFlash('error', $translator->trans('admin.flash.only_children_have_pin'));

            return $this->redirectToRoute('admin.user.index');
        }

        $form = $this->createForm(PinResetType::class)->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            /** @var string $pin */
            $pin = $form->get('pin')->getData();
            $profile->setPinCode($hasher->hash($profile, $pin));

            // A reset also clears the lockout: the whole point is to unblock.
            $throttle->reset($profile);
            $this->entityManager->flush();
            $this->addFlash('success', $translator->trans('admin.flash.pin_saved', ['%name%' => (string) $profile->getDisplayName()]));

            return $this->redirectToRoute('admin.user.index');
        }

        return $this->render('admin/user/reset_pin.html.twig', [
            'form' => $form,
            'profile' => $profile,
        ]);
    }

    #[Route('/{id}/debloquer', name: 'unlock', requirements: ['id' => Requirement::DIGITS], methods: ['POST'])]
    public function unlock(
        #[MapEntity(id: 'id')]
        User $profile,
        Request $request,
        PinCodeThrottle $throttle,
        TranslatorInterface $translator,
    ): Response {
        if ($this->isCsrfTokenValid('user-unlock'.$profile->getId(), (string) $request->request->get('_token'))) {
            $throttle->reset($profile);
            $this->addFlash('success', $translator->trans('admin.flash.unlocked', ['%name%' => (string) $profile->getDisplayName()]));
        }

        return $this->redirectToRoute('admin.user.index');
    }

    #[Route('/{id}/supprimer', name: 'delete', requirements: ['id' => Requirement::DIGITS], methods: ['POST'])]
    public function delete(
        #[MapEntity(id: 'id')]
        User $profile,
        Request $request,
        TranslatorInterface $translator,
    ): Response {
        if ($profile->getId() === $this->getUserOrThrow()->getId()) {
            $this->addFlash('error', $translator->trans('admin.flash.cannot_delete_self'));

            return $this->redirectToRoute('admin.user.index');
        }

        if ($this->isCsrfTokenValid('user-delete'.$profile->getId(), (string) $request->request->get('_token'))) {
            $name = (string) $profile->getDisplayName();
            $this->removeAndFlush($profile);
            $this->addFlash('success', $translator->trans('admin.flash.profile_deleted', ['%name%' => $name]));
        }

        return $this->redirectToRoute('admin.user.index');
    }
}
