<?php

declare(strict_types=1);

namespace App\Controller;

use App\Controller;
use App\Enum\AppLocale;
use App\Listener\LocaleSubscriber;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

use const PHP_URL_HOST;

final class LocaleController extends Controller
{
    /**
     * Switches language and returns where the visitor was.
     *
     * The referer is only honoured when it points back at this site, so the
     * switcher cannot be turned into an open redirect.
     */
    #[Route('/langue/{locale}', name: 'locale.switch', methods: ['GET'])]
    public function switch(string $locale, Request $request): Response
    {
        $target = AppLocale::tryFrom($locale);

        if ($target instanceof AppLocale) {
            $request->getSession()->set(LocaleSubscriber::SESSION_KEY, $target->value);
        }

        return $this->redirect($this->safeReferer($request));
    }

    private function safeReferer(Request $request): string
    {
        $referer = (string) $request->headers->get('referer');

        if ('' === $referer) {
            return $this->generateUrl('home');
        }

        $host = parse_url($referer, PHP_URL_HOST);

        if (null !== $host && $host !== $request->getHost()) {
            return $this->generateUrl('home');
        }

        return $referer;
    }
}
