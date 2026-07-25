<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * The languages the interface is available in.
 */
enum AppLocale: string
{
    case French = 'fr';
    case English = 'en';

    public const string DEFAULT = self::French->value;

    /** Name of the language, written in that language. */
    public function label(): string
    {
        return match ($this) {
            self::French => 'Français',
            self::English => 'English',
        };
    }

    /** Two-letter badge for the switcher. */
    public function short(): string
    {
        return strtoupper($this->value);
    }

    /**
     * @return list<string>
     */
    public static function codes(): array
    {
        return array_column(self::cases(), 'value');
    }

    public static function isSupported(string $locale): bool
    {
        return null !== self::tryFrom($locale);
    }
}
