<?php

declare(strict_types=1);

namespace App\Listener;

use App\Enum\AppLocale;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

use function is_string;

/**
 * Picks the interface language for the request.
 *
 * The locale lives in the session rather than in the URL, so every address
 * stays stable: the child's iPad bookmark keeps working whatever language the
 * interface happens to be in. First visit falls back to the browser's own
 * preference, then to French.
 */
#[AsEventListener(event: KernelEvents::REQUEST, priority: 20)]
final readonly class LocaleSubscriber
{
    public const string SESSION_KEY = '_locale';

    public function __invoke(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $request = $event->getRequest();

        if (!$request->hasSession()) {
            return;
        }

        $stored = $request->getSession()->get(self::SESSION_KEY);

        if (is_string($stored) && AppLocale::isSupported($stored)) {
            $request->setLocale($stored);

            return;
        }

        $request->setLocale(
            $request->getPreferredLanguage(AppLocale::codes()) ?? AppLocale::DEFAULT,
        );
    }
}
