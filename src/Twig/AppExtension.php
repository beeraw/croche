<?php

declare(strict_types=1);

namespace App\Twig;

use App\Enum\AppLocale;
use Twig\Attribute\AsTwigFunction;

final class AppExtension
{
    /**
     * The languages the switcher offers.
     *
     * @return list<AppLocale>
     */
    #[AsTwigFunction('app_locales')]
    public function locales(): array
    {
        return AppLocale::cases();
    }

    /**
     * The language a request is being served in.
     *
     * Falls back to the default rather than to null: the switcher always has a
     * language to show on its button, even on a request that never went
     * through the locale listener.
     */
    #[AsTwigFunction('app_locale')]
    public function locale(string $code): AppLocale
    {
        return AppLocale::tryFrom($code) ?? AppLocale::from(AppLocale::DEFAULT);
    }
}
