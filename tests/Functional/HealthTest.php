<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Tests\DatabaseTestCase;

final class HealthTest extends DatabaseTestCase
{
    public function testTheProbeAnswersWithoutSigningIn(): void
    {
        $this->client->request('GET', '/healthz');

        self::assertResponseIsSuccessful();
        self::assertSame('ok', $this->client->getResponse()->getContent());
    }
}
