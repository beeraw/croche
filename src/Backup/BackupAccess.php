<?php

declare(strict_types=1);

namespace App\Backup;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

use function hash_equals;

/**
 * An outside job pulls the database dump through the backup API, authenticated with a shared secret. An empty
 * secret closes the API altogether.
 *
 * Croche stores no uploaded file: a score is a JSON document in the database, so the dump is the whole backup and
 * the media list of the API is always empty.
 */
class BackupAccess
{
    public function __construct(
        #[Autowire('%env(default::BACKUP_SECRET)%')]
        private readonly ?string $secret = null,
    ) {
    }

    public function isAuthorized(?string $given): bool
    {
        return null !== $this->secret && '' !== $this->secret && null !== $given && hash_equals($this->secret, $given);
    }
}
