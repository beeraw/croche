<?php

declare(strict_types=1);

namespace App\Controller;

use App\Backup\BackupAccess;
use App\Backup\DatabaseDumper;
use App\Controller;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\Routing\Attribute\Route;

use function flush;
use function str_starts_with;
use function substr;

/**
 * Backup API pulled by an outside job, outside any session (see the "backup" firewall). The secret comes as the
 * X-Backup-Secret header or, for clients that cannot set one, as the "secret" query parameter (which then shows in
 * the access logs). A wrong or missing secret gets a 404, which says nothing about the API being there.
 *
 * The media routes answer the contract shared by every site, but Croche has no media: the list is always empty and
 * no path can be downloaded.
 *
 * Prefer the bearer token: Caddy writes the Authorization header as REDACTED in its access logs, in the
 * container as on the host, while it logs the X-Backup-Secret header in clear.
 */
#[Route('/api', name: 'api.backup.')]
class BackupApiController extends Controller
{
    #[Route('/database/dump', name: 'dump', methods: ['GET'])]
    public function dump(Request $request, BackupAccess $access, DatabaseDumper $dumper): StreamedResponse
    {
        $this->denyUnlessAuthorized($request, $access);

        $compress = $request->query->getBoolean('compress');
        $response = new StreamedResponse(static function () use ($compress, $dumper): void {
            $dumper->stream($compress, static function (string $chunk): void {
                echo $chunk;
                flush();
            });
        });

        $response->headers->set('Content-Type', $compress ? 'application/gzip' : 'application/sql');
        $response->headers->set('Content-Disposition', $response->headers->makeDisposition(
            ResponseHeaderBag::DISPOSITION_ATTACHMENT,
            $dumper->fileName($compress),
        ));

        return $response;
    }

    #[Route('/media/files', name: 'media_files', methods: ['GET'])]
    public function mediaFiles(Request $request, BackupAccess $access): JsonResponse
    {
        $this->denyUnlessAuthorized($request, $access);

        return $this->json(['files' => []]);
    }

    #[Route('/media/download', name: 'media_download', methods: ['GET'])]
    public function mediaDownload(Request $request, BackupAccess $access): never
    {
        $this->denyUnlessAuthorized($request, $access);

        throw $this->createNotFoundException();
    }

    private function denyUnlessAuthorized(Request $request, BackupAccess $access): void
    {
        // A bearer token is what Caddy writes as REDACTED in its access logs, here and on the host; X-Backup-Secret,
        // which it logs in clear, stays for the clients that still send it.
        $authorization = (string) $request->headers->get('Authorization');
        $secret = str_starts_with($authorization, 'Bearer ')
            ? substr($authorization, 7)
            : ($request->headers->get('X-Backup-Secret') ?? $request->query->getString('secret'));

        if (!$access->isAuthorized($secret)) {
            throw $this->createNotFoundException();
        }
    }
}
