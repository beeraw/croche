<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Enum\AppLocale;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Yaml\Yaml;

use function dirname;
use function is_array;
use function sprintf;

/**
 * The catalogues have to stay in step with each other.
 *
 * With five languages, a key added to one file and forgotten in the others
 * silently falls back to French for everybody else — visible to nobody who
 * only reads the language they wrote. These tests make that a failure instead.
 */
final class TranslationCatalogueTest extends TestCase
{
    private const string REFERENCE = 'fr';

    #[DataProvider('locales')]
    public function testEveryLanguageHasACatalogue(AppLocale $locale): void
    {
        self::assertFileExists(self::path($locale->value));
    }

    #[DataProvider('locales')]
    public function testEveryCatalogueHoldsTheSameKeys(AppLocale $locale): void
    {
        $reference = self::keys(self::REFERENCE);
        $keys = self::keys($locale->value);

        self::assertSame([], array_values(array_diff($reference, $keys)), 'Missing keys');
        self::assertSame([], array_values(array_diff($keys, $reference)), 'Unknown keys');
    }

    /**
     * A dropped %title% or {minutes} does not break the page, it just makes
     * the message nonsense — so it has to be caught here.
     */
    #[DataProvider('locales')]
    public function testEveryPlaceholderSurvivesTranslation(AppLocale $locale): void
    {
        $reference = self::messages(self::REFERENCE);
        $messages = self::messages($locale->value);

        foreach ($reference as $key => $text) {
            preg_match_all('/%[a-z_]+%|\{[a-z]+\}/', $text, $matches);

            foreach ($matches[0] as $placeholder) {
                self::assertStringContainsString(
                    $placeholder,
                    $messages[$key],
                    sprintf('%s is missing from %s in %s', $placeholder, $key, $locale->value),
                );
            }
        }
    }

    /**
     * @return iterable<string, array{AppLocale}>
     */
    public static function locales(): iterable
    {
        foreach (AppLocale::cases() as $locale) {
            yield $locale->value => [$locale];
        }
    }

    /**
     * @return list<string>
     */
    private static function keys(string $locale): array
    {
        return array_keys(self::messages($locale));
    }

    /**
     * @return array<string, string>
     */
    private static function messages(string $locale): array
    {
        /** @var array<string, mixed> $parsed */
        $parsed = Yaml::parseFile(self::path($locale));

        return self::flatten($parsed);
    }

    /**
     * @param array<string, mixed> $tree
     *
     * @return array<string, string>
     */
    private static function flatten(array $tree, string $prefix = ''): array
    {
        $flat = [];

        foreach ($tree as $key => $value) {
            $path = '' === $prefix ? (string) $key : $prefix.'.'.$key;

            if (is_array($value)) {
                $flat = [...$flat, ...self::flatten($value, $path)];

                continue;
            }

            $flat[$path] = (string) $value;
        }

        return $flat;
    }

    private static function path(string $locale): string
    {
        return dirname(__DIR__, 2)."/translations/messages.{$locale}.yaml";
    }
}
