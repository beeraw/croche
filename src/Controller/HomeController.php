<?php

declare(strict_types=1);

namespace App\Controller;

use App\Controller;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class HomeController extends Controller
{
    /**
     * The landing page is just a signpost: signed-in users go where they belong,
     * everyone else lands on the profile picker.
     */
    #[Route('/', name: 'home')]
    public function index(): Response
    {
        $user = $this->getUser();

        if (null === $user) {
            return $this->redirectToRoute('security.profiles');
        }

        return $this->redirectToRoute($user->isAdmin() ? 'admin.user.index' : 'score.index');
    }
}
