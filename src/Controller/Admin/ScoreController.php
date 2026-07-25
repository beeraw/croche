<?php

declare(strict_types=1);

namespace App\Controller\Admin;

use App\Controller;
use App\Entity\Score;
use App\Entity\ScoreRevision;
use App\Entity\User;
use App\Repository\ScoreRepository;
use App\Repository\ScoreRevisionRepository;
use App\Score\ScoreRevisionRecorder;
use Symfony\Bridge\Doctrine\Attribute\MapEntity;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Component\Security\Http\Attribute\IsGranted;

use function sprintf;

#[Route('/admin/partitions', name: 'admin.score.')]
#[IsGranted(User::ROLE_ADMIN)]
final class ScoreController extends Controller
{
    #[Route('', name: 'index', methods: ['GET'])]
    public function index(ScoreRepository $repository): Response
    {
        return $this->render('admin/score/index.html.twig', [
            'scores' => $repository->findAllWithOwner(),
        ]);
    }

    /**
     * Revision history, newest first. The safety net made visible.
     */
    #[Route('/{id}/historique', name: 'history', requirements: ['id' => Requirement::DIGITS], methods: ['GET'])]
    public function history(
        #[MapEntity(id: 'id')]
        Score $score,
        ScoreRevisionRepository $repository,
    ): Response {
        return $this->render('admin/score/history.html.twig', [
            'score' => $score,
            'revisions' => $repository->findByScore($score),
            'keep' => ScoreRevisionRecorder::KEEP,
        ]);
    }

    /**
     * Restoring is itself a change, so the version being replaced is snapshotted
     * first — an accidental restore stays undoable.
     */
    #[Route(
        '/{id}/historique/{revision}/restaurer',
        name: 'restore',
        requirements: ['id' => Requirement::DIGITS, 'revision' => Requirement::DIGITS],
        methods: ['POST'],
    )]
    public function restore(
        #[MapEntity(id: 'id')]
        Score $score,
        #[MapEntity(id: 'revision')]
        ScoreRevision $revision,
        Request $request,
        ScoreRevisionRecorder $recorder,
    ): Response {
        if ($revision->getScore()?->getId() !== $score->getId()) {
            throw $this->createNotFoundException();
        }

        $token = (string) $request->request->get('_token');

        if ($this->isCsrfTokenValid('score-restore'.$revision->getId(), $token)) {
            $content = $revision->getContent();
            $recorded = $recorder->record($score, $content);
            $score->setContent($content);
            $this->entityManager->flush();

            if ($recorded) {
                $recorder->purge($score);
            }

            $this->addFlash('success', sprintf(
                'Version du %s restaurée.',
                $revision->getCreatedAt()?->format('d/m/Y à H\hi') ?? '',
            ));
        }

        return $this->redirectToRoute('admin.score.history', ['id' => $score->getId()]);
    }

    #[Route('/{id}/supprimer', name: 'delete', requirements: ['id' => Requirement::DIGITS], methods: ['POST'])]
    public function delete(#[MapEntity(id: 'id')] Score $score, Request $request): Response
    {
        if ($this->isCsrfTokenValid('score-delete'.$score->getId(), (string) $request->request->get('_token'))) {
            $title = (string) $score->getTitle();
            $this->removeAndFlush($score);
            $this->addFlash('success', sprintf('« %s » supprimé.', $title));
        }

        return $this->redirectToRoute('admin.score.index');
    }
}
