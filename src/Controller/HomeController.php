<?php

declare(strict_types=1);

namespace App\Controller;

use App\Controller;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class HomeController extends Controller
{
    /**
     * The public landing page: what Croche is, and where the source lives.
     *
     * Signed-in visitors never see it — they are sent straight to their own
     * space, so the child's bookmark still lands one tap from her pieces.
     */
    #[Route('/', name: 'home', methods: ['GET'])]
    public function index(): Response
    {
        $user = $this->getUser();

        if (null !== $user) {
            return $this->redirectToRoute($user->isAdmin() ? 'admin.user.index' : 'score.index');
        }

        return $this->render('home/index.html.twig');
    }
}
