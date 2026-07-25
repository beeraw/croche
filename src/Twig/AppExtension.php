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
}
