<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Tests\DatabaseTestCase;

use const JSON_THROW_ON_ERROR;

final class ManifestTest extends DatabaseTestCase
{
    public function testItIsServedAsAManifest(): void
    {
        $this->client->request('GET', '/manifest.webmanifest');

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/manifest+json');
    }

    /**
     * Without standalone the icon opens an ordinary Safari tab, which is the
     * whole point of the exercise: the chrome is what eats the keyboard.
     */
    public function testItAsksForAStandaloneWindow(): void
    {
        $manifest = $this->manifest();

        self::assertSame('standalone', $manifest['display']);
        self::assertSame('/', $manifest['start_url']);
    }

    /**
     * A manifest is fetched without credentials unless the link tag says
     * otherwise, and the language lives in the session cookie — so the tag
     * carrying use-credentials is what makes the translated name arrive.
     */
    public function testTheLinkTagCarriesTheSessionCookie(): void
    {
        $crawler = $this->client->request('GET', '/');
        $link = $crawler->filter('link[rel="manifest"]');

        self::assertCount(1, $link);
        self::assertSame('use-credentials', $link->attr('crossorigin'));
    }

    public function testTheInstalledNameFollowsTheChosenLanguage(): void
    {
        $this->client->request('GET', '/langue/de');

        self::assertSame('Croche — Musik schreiben', $this->manifest()['name']);

        $this->client->request('GET', '/langue/fr');

        self::assertSame('Croche — écrire de la musique', $this->manifest()['name']);
    }

    /**
     * Adding Croche to the home screen is something a visitor does before ever
     * tapping a PIN, so the catch-all firewall rule must not swallow it.
     */
    public function testItIsReadableWithoutSigningIn(): void
    {
        $this->client->request('GET', '/manifest.webmanifest');

        self::assertResponseStatusCodeSame(200);
    }

    public function testItPointsAtIconsThatExist(): void
    {
        $icons = $this->manifest()['icons'];

        self::assertNotEmpty($icons);

        foreach ($icons as $icon) {
            self::assertIsArray($icon);
            self::assertIsString($icon['src']);
            self::assertFileExists(self::projectDir().'/public'.$icon['src']);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function manifest(): array
    {
        $this->client->request('GET', '/manifest.webmanifest');

        $content = $this->client->getResponse()->getContent();
        self::assertIsString($content);

        $decoded = json_decode($content, true, flags: JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);

        return $decoded;
    }

    private static function projectDir(): string
    {
        $dir = self::getContainer()->getParameter('kernel.project_dir');
        self::assertIsString($dir);

        return $dir;
    }
}
