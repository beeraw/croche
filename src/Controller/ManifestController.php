<?php

declare(strict_types=1);

namespace App\Controller;

use App\Controller;
use Symfony\Component\Asset\Packages;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Contracts\Translation\TranslatorInterface;

/**
 * The web app manifest, served rather than shipped as a static file.
 *
 * A file in public/ would have frozen the installed name in one language.
 * Serving it means the name follows the interface: a family reading Croche in
 * Portuguese installs it with a Portuguese name under the icon.
 *
 * The catch is that a manifest is fetched without credentials by default, so
 * the session cookie — and with it the chosen language — never arrives. The
 * link tag in base.html.twig carries crossorigin="use-credentials" for exactly
 * that reason.
 */
final class ManifestController extends Controller
{
    /**
     * Repeated from _variables.scss, which JSON cannot read. They are the
     * splash screen iOS paints before the first byte of CSS arrives, so they
     * have to match $paper and $plum or the launch flashes the wrong colour.
     */
    private const string BACKGROUND_COLOR = '#fffaf3';
    private const string THEME_COLOR = '#6d3a8e';

    #[Route('/manifest.webmanifest', name: 'manifest', methods: ['GET'])]
    public function index(Request $request, TranslatorInterface $translator, Packages $assets): JsonResponse
    {
        $home = $this->generateUrl('home');

        $response = new JsonResponse([
            'name' => $translator->trans('manifest.name'),
            'short_name' => $translator->trans('manifest.short_name'),
            'description' => $translator->trans('manifest.description'),
            'lang' => $request->getLocale(),
            // Launching lands on the home page, which forwards a signed-in
            // child straight to her pieces: one tap from icon to music.
            'start_url' => $home,
            'scope' => $home,
            'display' => 'standalone',
            'background_color' => self::BACKGROUND_COLOR,
            'theme_color' => self::THEME_COLOR,
            'icons' => [
                [
                    'src' => $assets->getUrl('icons/croche-192.png'),
                    'sizes' => '192x192',
                    'type' => 'image/png',
                ],
                [
                    'src' => $assets->getUrl('icons/croche-512.png'),
                    'sizes' => '512x512',
                    'type' => 'image/png',
                ],
            ],
        ]);

        $response->headers->set('Content-Type', 'application/manifest+json');

        return $response;
    }
}
