<?php

declare(strict_types=1);

namespace App\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Throwable;

/**
 * Liveness probe for the release script and the container health check: answers once the application boots and
 * reaches its database, so a container started on an unreachable database is never reported as released.
 */
final class HealthController extends AbstractController
{
    #[Route('/healthz', name: 'healthz', methods: ['GET'])]
    public function index(Connection $connection): Response
    {
        try {
            $connection->executeQuery('SELECT 1');
        } catch (Throwable) {
            return new Response('database unreachable', Response::HTTP_SERVICE_UNAVAILABLE, ['Content-Type' => 'text/plain']);
        }

        return new Response('ok', Response::HTTP_OK, ['Content-Type' => 'text/plain', 'Cache-Control' => 'no-store']);
    }
}
