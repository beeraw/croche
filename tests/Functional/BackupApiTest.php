<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Backup\BackupAccess;
use App\Tests\DatabaseTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

use function gzdecode;
use function json_decode;

use const JSON_THROW_ON_ERROR;

/**
 * The backup API (database dump, media list), behind the shared secret of .env.test. The dump comes from a stand-in
 * for mariadb-dump, since the test database is SQLite.
 */
final class BackupApiTest extends DatabaseTestCase
{
    private const string SECRET = 'test-backup-secret';

    /**
     * @return iterable<string, array{0: string}>
     */
    public static function routes(): iterable
    {
        yield 'dump' => ['/api/database/dump'];
        yield 'media files' => ['/api/media/files'];
        yield 'media download' => ['/api/media/download'];
    }

    #[DataProvider('routes')]
    public function testWithoutTheSecretTheApiAnswersNotFound(string $url): void
    {
        $this->client->request('GET', $url);
        self::assertResponseStatusCodeSame(404);

        $this->client->request('GET', $url.'?secret=wrong');
        self::assertResponseStatusCodeSame(404);

        $this->client->request('GET', $url, server: ['HTTP_X_BACKUP_SECRET' => 'wrong']);
        self::assertResponseStatusCodeSame(404);
    }

    public function testAnEmptySecretKeepsTheApiClosed(): void
    {
        $access = new BackupAccess('');

        self::assertFalse($access->isAuthorized(''));
        self::assertFalse($access->isAuthorized(null));
        self::assertFalse(new BackupAccess()->isAuthorized('anything'));
    }

    public function testTheMediaListIsEmptyBecauseCrocheKeepsNoFile(): void
    {
        $this->client->request('GET', '/api/media/files?min=0', server: ['HTTP_X_BACKUP_SECRET' => self::SECRET]);

        self::assertResponseIsSuccessful();
        self::assertSame(['files' => []], json_decode((string) $this->client->getResponse()->getContent(), true, 512, JSON_THROW_ON_ERROR));
    }

    public function testNoPathCanBeDownloaded(): void
    {
        $this->client->request('GET', '/api/media/download?path='.rawurlencode('../.env'), server: ['HTTP_X_BACKUP_SECRET' => self::SECRET]);

        self::assertResponseStatusCodeSame(404);
    }

    public function testTheDumpIsAGzippedCompleteSqlDump(): void
    {
        $this->client->request('GET', '/api/database/dump?compress=1', server: ['HTTP_X_BACKUP_SECRET' => self::SECRET]);

        self::assertResponseIsSuccessful();
        self::assertResponseHeaderSame('Content-Type', 'application/gzip');
        self::assertMatchesRegularExpression('/\.sql\.gz/', (string) $this->client->getResponse()->headers->get('Content-Disposition'));

        $sql = gzdecode((string) $this->client->getInternalResponse()->getContent());
        self::assertIsString($sql, 'The dump is not a complete gzip stream.');
        self::assertStringContainsString('-- Dump completed', $sql);
    }

    public function testTheSessionProtectedScoreApiStaysOutOfTheBackupFirewall(): void
    {
        $this->client->request('GET', '/api/scores', server: ['HTTP_X_BACKUP_SECRET' => self::SECRET]);

        self::assertResponseRedirects();
    }
}
