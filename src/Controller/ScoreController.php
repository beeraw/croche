<?php

declare(strict_types=1);

namespace App\Controller;

use App\Controller;
use App\Entity\Score;
use App\Repository\ScoreRepository;
use App\Score\ScoreFactory;
use App\Score\ScoreSchema;
use App\Security\Voter\ScoreVoter;
use Symfony\Bridge\Doctrine\Attribute\MapEntity;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;

use function sprintf;

/**
 * The child's own space: their pieces, and the editor.
 */
#[Route('/morceaux', name: 'score.')]
final class ScoreController extends Controller
{
    #[Route('', name: 'index', methods: ['GET'])]
    public function index(ScoreRepository $repository): Response
    {
        $user = $this->getUserOrThrow();

        if ($user->isAdmin()) {
            return $this->redirectToRoute('admin.score.index');
        }

        return $this->render('score/index.html.twig', [
            'scores' => $repository->findByOwner($user),
        ]);
    }

    #[Route('/nouveau', name: 'new', methods: ['POST'])]
    public function new(Request $request, ScoreFactory $factory): Response
    {
        $user = $this->getUserOrThrow();

        if (!$this->isCsrfTokenValid('score-new', (string) $request->request->get('_token'))) {
            return $this->redirectToRoute('score.index');
        }

        $score = $factory->createBlank($user);
        $this->persistAndFlush($score);

        return $this->redirectToRoute('score.edit', ['id' => $score->getId()]);
    }

    #[Route('/{id}', name: 'edit', requirements: ['id' => Requirement::DIGITS], methods: ['GET'])]
    public function edit(#[MapEntity(id: 'id')] Score $score): Response
    {
        $this->denyAccessUnlessGranted(ScoreVoter::EDIT, $score);

        return $this->render('score/edit.html.twig', [
            'score' => $score,
            'schema' => [
                'durations' => ScoreSchema::DURATIONS,
                'accidentals' => ScoreSchema::ACCIDENTALS,
                'tempoMin' => ScoreSchema::TEMPO_MIN,
                'tempoMax' => ScoreSchema::TEMPO_MAX,
                'maxMeasures' => ScoreSchema::MAX_MEASURES,
            ],
        ]);
    }

    #[Route('/{id}/renommer', name: 'rename', requirements: ['id' => Requirement::DIGITS], methods: ['POST'])]
    public function rename(#[MapEntity(id: 'id')] Score $score, Request $request): Response
    {
        $this->denyAccessUnlessGranted(ScoreVoter::EDIT, $score);

        if (!$this->isCsrfTokenValid('score-rename'.$score->getId(), (string) $request->request->get('_token'))) {
            return $this->redirectToRoute('score.index');
        }

        $title = trim((string) $request->request->get('title'));

        if ('' !== $title) {
            $score->setTitle(mb_substr($title, 0, 120));
            $this->entityManager->flush();
            $this->addFlash('success', sprintf('Renommé en « %s ».', $score->getTitle()));
        }

        return $this->redirectToRoute('score.index');
    }

    #[Route('/{id}/dupliquer', name: 'duplicate', requirements: ['id' => Requirement::DIGITS], methods: ['POST'])]
    public function duplicate(
        #[MapEntity(id: 'id')]
        Score $score,
        Request $request,
        ScoreFactory $factory,
    ): Response {
        $this->denyAccessUnlessGranted(ScoreVoter::VIEW, $score);

        if (!$this->isCsrfTokenValid('score-duplicate'.$score->getId(), (string) $request->request->get('_token'))) {
            return $this->redirectToRoute('score.index');
        }

        $copy = $factory->duplicate($score);
        $this->persistAndFlush($copy);
        $this->addFlash('success', sprintf('Copie créée : « %s ».', $copy->getTitle()));

        return $this->redirectToRoute('score.index');
    }

    #[Route('/{id}/supprimer', name: 'delete', requirements: ['id' => Requirement::DIGITS], methods: ['POST'])]
    public function delete(#[MapEntity(id: 'id')] Score $score, Request $request): Response
    {
        $this->denyAccessUnlessGranted(ScoreVoter::DELETE, $score);

        if (!$this->isCsrfTokenValid('score-delete'.$score->getId(), (string) $request->request->get('_token'))) {
            return $this->redirectToRoute('score.index');
        }

        $title = (string) $score->getTitle();
        $this->removeAndFlush($score);
        $this->addFlash('success', sprintf('« %s » a été supprimé.', $title));

        return $this->redirectToRoute('score.index');
    }
}
