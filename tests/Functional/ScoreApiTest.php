<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Entity\Score;
use App\Entity\User;
use App\Score\ScoreSchema;
use App\Tests\DatabaseTestCase;
use Symfony\Component\HttpFoundation\Response;

use const JSON_THROW_ON_ERROR;

final class ScoreApiTest extends DatabaseTestCase
{
    private ?Score $tokenSource = null;

    public function testListingRequiresSigningIn(): void
    {
        $this->client->request('GET', '/api/scores');

        self::assertResponseRedirects();
    }

    public function testAChildOnlySeesTheirOwnScores(): void
    {
        $mine = $this->createChild('mine');
        $theirs = $this->createChild('theirs');

        $this->createScore($mine, 'Mine');
        $this->createScore($theirs, 'Theirs');

        $this->client->loginUser($mine);
        $this->client->request('GET', '/api/scores');

        self::assertResponseIsSuccessful();
        $titles = array_column($this->payload()['scores'], 'title');
        self::assertSame(['Mine'], $titles);
    }

    public function testAnAdminSeesEveryScore(): void
    {
        $child = $this->createChild();
        $admin = $this->createAdmin();
        $this->createScore($child, 'Hers');

        $this->client->loginUser($admin);
        $this->client->request('GET', '/api/scores');

        self::assertResponseIsSuccessful();
        self::assertCount(1, $this->payload()['scores']);
    }

    public function testAChildCannotReadAnotherChildsScore(): void
    {
        $owner = $this->createChild('owner');
        $other = $this->createChild('other');
        $score = $this->createScore($owner, 'Private');

        $this->client->loginUser($other);
        $this->client->request('GET', '/api/scores/'.$score->getId());

        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
    }

    public function testAChildCannotDeleteAnotherChildsScore(): void
    {
        $owner = $this->createChild('owner');
        $other = $this->createChild('other');
        $score = $this->createScore($owner, 'Private');

        $this->client->loginUser($other);
        $this->client->request('DELETE', '/api/scores/'.$score->getId());

        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
        self::assertNotNull($this->manager()->find(Score::class, $score->getId()));
    }

    public function testUpdatingWithoutACsrfTokenIsRefused(): void
    {
        $child = $this->createChild();
        $score = $this->createScore($child, 'Mine');

        $this->client->loginUser($child);
        $this->json('PUT', '/api/scores/'.$score->getId(), ['title' => 'Hijacked']);

        self::assertResponseStatusCodeSame(Response::HTTP_FORBIDDEN);
        self::assertSame('Mine', $this->reload(Score::class, $score->getId())->getTitle());
    }

    public function testUpdatingWithAValidTokenSucceeds(): void
    {
        $child = $this->createChild();
        $score = $this->createScore($child, 'Mine');

        $this->client->loginUser($child);
        $content = ScoreSchema::blankContent(2);
        $content['tempo'] = 120;

        $this->json('PUT', '/api/scores/'.$score->getId(), [
            'title' => 'Renamed',
            'content' => $content,
        ], withToken: true);

        self::assertResponseIsSuccessful();
        $saved = $this->reload(Score::class, $score->getId());
        self::assertSame('Renamed', $saved->getTitle());
        self::assertSame(120, $saved->getContent()['tempo']);
    }

    public function testABadDocumentIsRefusedWithTheFaultyPath(): void
    {
        $child = $this->createChild();
        $score = $this->createScore($child, 'Mine');

        $this->client->loginUser($child);
        $content = ScoreSchema::blankContent(2);
        // Knock one stave out of step with the other.
        array_pop($content['staves'][1]['measures']);

        $this->json('PUT', '/api/scores/'.$score->getId(), ['content' => $content], withToken: true);

        self::assertResponseStatusCodeSame(Response::HTTP_UNPROCESSABLE_ENTITY);
        self::assertSame('staves[1].measures', $this->payload()['path']);
    }

    public function testMalformedJsonIsRefused(): void
    {
        $child = $this->createChild();
        $score = $this->createScore($child, 'Mine');

        $this->client->loginUser($child);
        $this->client->request(
            'PUT',
            '/api/scores/'.$score->getId(),
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_X_CSRF_TOKEN' => $this->csrfToken(),
            ],
            content: '{ this is not json',
        );

        self::assertResponseStatusCodeSame(Response::HTTP_BAD_REQUEST);
    }

    public function testCreatingAScore(): void
    {
        $child = $this->createChild();
        $this->client->loginUser($child);

        $this->json('POST', '/api/scores', ['title' => 'Fresh'], withToken: true);

        self::assertResponseStatusCodeSame(Response::HTTP_CREATED);
        self::assertSame('Fresh', $this->payload()['score']['title']);
        self::assertSame(4, $this->payload()['score']['measureCount']);
    }

    public function testDeletingOwnScore(): void
    {
        $child = $this->createChild();
        $score = $this->createScore($child, 'Doomed');
        $id = $score->getId();

        $this->client->loginUser($child);
        $this->json('DELETE', '/api/scores/'.$id, withToken: true);

        self::assertResponseStatusCodeSame(Response::HTTP_NO_CONTENT);
        self::assertNull($this->manager()->find(Score::class, $id));
    }

    /**
     * The error text follows the caller's language, since the editor shows it
     * to the child as it arrives.
     */
    public function testErrorsAreTranslated(): void
    {
        $child = $this->createChild();
        $score = $this->createScore($child, 'Mine');
        $this->client->loginUser($child);

        $this->client->request('PUT', '/api/scores/'.$score->getId(), server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT_LANGUAGE' => 'en',
        ], content: '{}');

        self::assertStringContainsString('security token', $this->payload()['error']);
    }

    /**
     * @param array<string, mixed> $body
     */
    private function json(string $method, string $url, array $body = [], bool $withToken = false): void
    {
        $server = ['CONTENT_TYPE' => 'application/json'];

        if ($withToken) {
            $server['HTTP_X_CSRF_TOKEN'] = $this->csrfToken();
        }

        $this->client->request($method, $url, server: $server, content: json_encode($body, JSON_THROW_ON_ERROR));
    }

    /**
     * Reads the API token out of a rendered editor page rather than minting one
     * from the container: the token is bound to the client's session, and this
     * is exactly the path the editor itself takes.
     */
    private function csrfToken(): string
    {
        $this->tokenSource ??= $this->createScore($this->signedInChild(), 'Token source');

        $crawler = $this->client->request('GET', '/morceaux/'.$this->tokenSource->getId());
        $editor = $crawler->filter('.editor')->first();

        self::assertGreaterThan(0, $editor->count(), 'The editor did not render.');

        return (string) $editor->attr('data-autosave-token-value');
    }

    private function signedInChild(): User
    {
        $user = static::getContainer()->get('security.token_storage')->getToken()?->getUser();

        self::assertInstanceOf(User::class, $user, 'No child is signed in.');

        return $user;
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(): array
    {
        return json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR);
    }

    private function createScore(User $owner, string $title): Score
    {
        $score = new Score()
            ->setOwner($owner)
            ->setTitle($title)
            ->setContent(ScoreSchema::blankContent());

        $this->manager()->persist($score);
        $this->manager()->flush();

        return $score;
    }
}
