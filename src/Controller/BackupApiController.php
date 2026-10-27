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

/**
 * Backup API pulled by an outside job, outside any session (see the "backup" firewall). The secret comes as the
 * X-Backup-Secret header or, for clients that cannot set one, as the "secret" query parameter (which then shows in
 * the access logs). A wrong or missing secret gets a 404, which says nothing about the API being there.
 *
 * The media routes answer the contract shared by every site, but Croche has no media: the list is always empty and
 * no path can be downloaded.
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
        $secret = $request->headers->get('X-Backup-Secret') ?? $request->query->getString('secret');

        if (!$access->isAuthorized($secret)) {
            throw $this->createNotFoundException();
        }
    }
}
