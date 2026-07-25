<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Enum\AppLocale;
use App\Tests\DatabaseTestCase;

use function count;

final class LocaleTest extends DatabaseTestCase
{
    /**
     * The switcher is a menu, so a new language needs no template change: it
     * gets its own line, and the current one is the one wearing the tick.
     */
    public function testTheMenuOffersEveryLanguageAndMarksTheCurrentOne(): void
    {
        $this->client->request('GET', '/langue/en');
        $crawler = $this->client->request('GET', '/profils');

        self::assertCount(count(AppLocale::cases()), $crawler->filter('.language__menu .language__option'));
        self::assertSame('EN', $crawler->filter('.language__badge')->text());
        self::assertSame('English', trim($crawler->filter('.language__option.is-current')->text()));
    }

    public function testTheBrowserPreferenceDecidesOnAFirstVisit(): void
    {
        $crawler = $this->client->request('GET', '/', server: ['HTTP_ACCEPT_LANGUAGE' => 'en-GB,en;q=0.9']);

        self::assertResponseIsSuccessful();
        self::assertSame('en', $crawler->filter('html')->attr('lang'));
    }

    public function testFrenchIsTheFallbackForAnUnsupportedLanguage(): void
    {
        $crawler = $this->client->request('GET', '/', server: ['HTTP_ACCEPT_LANGUAGE' => 'de-DE,de;q=0.9']);

        self::assertSame('fr', $crawler->filter('html')->attr('lang'));
    }

    public function testTheChoiceSticksAcrossPages(): void
    {
        $this->client->request('GET', '/', server: ['HTTP_ACCEPT_LANGUAGE' => 'fr']);
        $this->client->request('GET', '/langue/en');

        $crawler = $this->client->request('GET', '/profils', server: ['HTTP_ACCEPT_LANGUAGE' => 'fr']);

        self::assertSame('en', $crawler->filter('html')->attr('lang'));
        self::assertStringContainsString('Pick your profile', $crawler->filter('.login__subtitle')->text());
    }

    public function testSwitchingBackToFrench(): void
    {
        $this->client->request('GET', '/langue/en');
        $this->client->request('GET', '/langue/fr');

        $crawler = $this->client->request('GET', '/profils');

        self::assertSame('fr', $crawler->filter('html')->attr('lang'));
        self::assertStringContainsString('Choisis ton profil', $crawler->filter('.login__subtitle')->text());
    }

    public function testAnUnknownLanguageLeavesTheChoiceAlone(): void
    {
        $this->client->request('GET', '/langue/fr');
        $this->client->request('GET', '/langue/de');

        $crawler = $this->client->request('GET', '/');

        self::assertSame('fr', $crawler->filter('html')->attr('lang'));
    }

    /**
     * The switcher sends the visitor back where they were, so it must not
     * become a way of bouncing them off the site.
     */
    public function testTheSwitcherRefusesToRedirectOffSite(): void
    {
        $this->client->request('GET', '/langue/en', server: ['HTTP_REFERER' => 'https://example.invalid/phish']);

        self::assertResponseRedirects('/');
    }

    public function testTheSwitcherReturnsToThePageYouWereOn(): void
    {
        $this->client->request('GET', '/langue/en', server: ['HTTP_REFERER' => 'http://localhost/profils']);

        self::assertResponseRedirects('http://localhost/profils');
    }

    public function testSwitchingIsAvailableWithoutSigningIn(): void
    {
        $this->client->request('GET', '/langue/en');

        self::assertResponseRedirects();
        self::assertResponseStatusCodeSame(302);
    }
}
