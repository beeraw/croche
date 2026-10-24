<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\Score;
use App\Entity\User;
use App\Score\ScoreSchema;
use App\Tests\DatabaseTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * The safety net of a framework upgrade: every screen answers, the protected ones send a visitor to sign in, and the
 * two ways of signing in work end to end.
 */
final class SiteSmokeTest extends DatabaseTestCase
{
    /**
     * @return iterable<string, array{string}>
     */
    public static function publicPages(): iterable
    {
        yield 'home' => ['/'];
        yield 'profiles' => ['/profils'];
        yield 'admin login' => ['/connexion'];
        yield 'manifest' => ['/manifest.webmanifest'];
        yield 'health probe' => ['/healthz'];
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function protectedPages(): iterable
    {
        yield 'library' => ['/morceaux'];
        yield 'editor' => ['/morceaux/1'];
        yield 'admin profiles' => ['/admin/profils'];
        yield 'admin scores' => ['/admin/partitions'];
    }

    #[DataProvider('publicPages')]
    public function testPublicPagesAnswer(string $path): void
    {
        $this->client->request('GET', $path);

        self::assertResponseIsSuccessful();
    }

    #[DataProvider('protectedPages')]
    public function testProtectedPagesSendAVisitorToSignIn(string $path): void
    {
        $this->client->request('GET', $path);

        self::assertResponseRedirects();
        self::assertStringEndsWith('/connexion', (string) $this->client->getResponse()->headers->get('Location'));
    }

    public function testAChildReachesTheLibraryAndTheEditor(): void
    {
        $child = $this->createChild();
        $score = $this->createScore($child);

        $this->client->loginUser($child);
        $this->client->request('GET', '/morceaux');
        self::assertResponseIsSuccessful();

        $this->client->request('GET', '/morceaux/'.$score->getId());
        self::assertResponseIsSuccessful();
    }

    public function testAChildCannotEnterTheAdminArea(): void
    {
        $this->client->loginUser($this->createChild());
        $this->client->request('GET', '/admin/profils');

        self::assertResponseStatusCodeSame(403);
    }

    public function testAnAdminReachesTheAdminArea(): void
    {
        $admin = $this->createAdmin();
        $score = $this->createScore($this->createChild());

        $this->client->loginUser($admin);

        foreach (['/admin/profils', '/admin/profils/nouveau', '/admin/partitions', '/admin/partitions/'.$score->getId().'/historique'] as $path) {
            $this->client->request('GET', $path);
            self::assertResponseIsSuccessful($path);
        }
    }

    public function testTheAdministratorSignsInWithHerPassword(): void
    {
        $this->createAdmin('admin', 'secret-password');

        $crawler = $this->client->request('GET', '/connexion');
        $this->client->submit($crawler->filter('form')->form([
            '_username' => 'admin',
            '_password' => 'secret-password',
        ]));

        self::assertResponseRedirects();
        $this->client->followRedirect();
        $this->client->request('GET', '/admin/profils');
        self::assertResponseIsSuccessful();
    }

    public function testASignedInChildCreatesAPiece(): void
    {
        $child = $this->createChild();
        $this->client->loginUser($child);
        $crawler = $this->client->request('GET', '/morceaux');
        $this->client->submit($crawler->filter('form[action$="/morceaux/nouveau"]')->first()->form());

        self::assertResponseRedirects();
        $score = $this->manager()->getRepository(Score::class)->findOneBy(['owner' => $child]);
        self::assertInstanceOf(Score::class, $score);
    }

    private function createScore(User $owner): Score
    {
        $score = new Score()
            ->setOwner($owner)
            ->setTitle('A piece')
            ->setContent(ScoreSchema::blankContent());
        $this->manager()->persist($score);
        $this->manager()->flush();

        return $score;
    }
}
