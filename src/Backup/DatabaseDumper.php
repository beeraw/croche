<?php

declare(strict_types=1);

namespace App\Backup;

use DateTimeImmutable;
use Doctrine\DBAL\Connection;
use RuntimeException;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Process\Process;

use function deflate_add;
use function deflate_init;
use function sprintf;
use function strlen;

use const ZLIB_ENCODING_GZIP;
use const ZLIB_FINISH;
use const ZLIB_NO_FLUSH;

/**
 * Streams a consistent dump of the application database: no table lock, one transaction, the password in the
 * environment rather than on the command line. mariadb-dump closes a full dump with a "-- Dump completed" line,
 * which is how the receiving side tells a complete dump from one cut short.
 */
class DatabaseDumper
{
    /**
     * Gzip divides the transferred size by about six, which is what keeps the download inside the timeouts of
     * whatever proxies sit in front of the application.
     */
    private const int COMPRESSION_LEVEL = 6;

    public function __construct(
        private readonly Connection $connection,
        #[Autowire('%env(MARIADB_DUMP)%')]
        private readonly string $binary = 'mariadb-dump',
    ) {
    }

    public function fileName(bool $compress): string
    {
        return sprintf(
            'dump_%s_%s.sql%s',
            $this->connection->getDatabase(),
            new DateTimeImmutable()->format('Y-m-d_H-i-s'),
            $compress ? '.gz' : ''
        );
    }

    /**
     * Hands every chunk to $write as it comes and returns the number of bytes written.
     *
     * @param callable(string): void $write
     */
    public function stream(bool $compress, callable $write): int
    {
        $params = $this->connection->getParams();
        $command = [
            $this->binary,
            '--skip-lock-tables',
            '--single-transaction',
            '--quick',
            '--add-drop-table',
            '--routines',
            '--events',
            '--triggers',
            '-h',
            (string) ($params['host'] ?? '127.0.0.1'),
            '-P',
            (string) ($params['port'] ?? 3306),
            '-u',
            (string) ($params['user'] ?? ''),
            (string) $this->connection->getDatabase(),
        ];

        $deflate = $compress ? deflate_init(ZLIB_ENCODING_GZIP, ['level' => self::COMPRESSION_LEVEL]) : null;
        $bytes = 0;
        $emit = static function (string $chunk) use ($write, &$bytes): void {
            $bytes += strlen($chunk);
            $write($chunk);
        };

        $process = new Process($command, null, ['MYSQL_PWD' => (string) ($params['password'] ?? '')]);
        $process->setTimeout(3600);
        $process->run(static function (string $type, string $buffer) use ($deflate, $emit): void {
            if (Process::OUT === $type) {
                $emit(null !== $deflate ? (string) deflate_add($deflate, $buffer, ZLIB_NO_FLUSH) : $buffer);
            }
        });

        if (!$process->isSuccessful()) {
            throw new RuntimeException($process->getErrorOutput());
        }

        // A gzip stream is only readable once terminated: without this last block the archive is truncated in a
        // way no retry on the receiving side can recover.
        if (null !== $deflate) {
            $emit((string) deflate_add($deflate, '', ZLIB_FINISH));
        }

        return $bytes;
    }
}
