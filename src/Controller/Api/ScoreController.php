<?php

declare(strict_types=1);

namespace App\Controller\Api;

use App\Controller;
use App\Entity\Score;
use App\Repository\ScoreRepository;
use App\Score\ScoreContentException;
use App\Score\ScoreContentValidator;
use App\Score\ScoreFactory;
use App\Score\ScorePresenter;
use App\Score\ScoreRevisionRecorder;
use App\Security\Voter\ScoreVoter;
use JsonException;
use Symfony\Bridge\Doctrine\Attribute\MapEntity;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;
use Symfony\Contracts\Translation\TranslatorInterface;

use function array_key_exists;
use function is_array;
use function is_string;

use const JSON_THROW_ON_ERROR;

/**
 * The editor's data endpoints. Plain Symfony controllers, JSON in and out.
 *
 * Mutating calls need a valid CSRF token in the X-CSRF-Token header, and every
 * access to an existing score goes through ScoreVoter.
 */
#[Route('/api/scores', name: 'api.score.')]
final class ScoreController extends Controller
{
    private const string CSRF_TOKEN_ID = 'score-api';

    #[Route('', name: 'index', methods: ['GET'])]
    public function index(ScoreRepository $repository, ScorePresenter $presenter): JsonResponse
    {
        $user = $this->getUserOrThrow();

        $scores = $user->isAdmin()
            ? $repository->findAllWithOwner()
            : $repository->findByOwner($user);

        return $this->json(['scores' => $presenter->collection($scores)]);
    }

    #[Route('/{id}', name: 'show', requirements: ['id' => Requirement::DIGITS], methods: ['GET'])]
    public function show(#[MapEntity(id: 'id')] Score $score, ScorePresenter $presenter): JsonResponse
    {
        $this->denyAccessUnlessGranted(ScoreVoter::VIEW, $score);

        return $this->json(['score' => $presenter->score($score)]);
    }

    #[Route('', name: 'create', methods: ['POST'])]
    public function create(
        Request $request,
        ScoreFactory $factory,
        ScoreContentValidator $validator,
        ScorePresenter $presenter,
        TranslatorInterface $translator,
    ): JsonResponse {
        $user = $this->getUserOrThrow();

        if (null !== $error = $this->rejectBadCsrf($request, $translator)) {
            return $error;
        }

        try {
            $payload = $this->decode($request);
        } catch (JsonException) {
            return $this->badRequest($translator->trans('api.invalid_json'));
        }

        $score = $factory->createBlank($user, $this->readTitle($payload));

        if (isset($payload['content'])) {
            try {
                $score->setContent($validator->validate($payload['content']));
            } catch (ScoreContentException $exception) {
                return $this->unprocessable($exception, $translator);
            }
        }

        $this->persistAndFlush($score);

        return $this->json(['score' => $presenter->score($score)], Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'update', requirements: ['id' => Requirement::DIGITS], methods: ['PUT'])]
    public function update(
        #[MapEntity(id: 'id')]
        Score $score,
        Request $request,
        ScoreContentValidator $validator,
        ScoreRevisionRecorder $recorder,
        ScorePresenter $presenter,
        TranslatorInterface $translator,
    ): JsonResponse {
        $this->denyAccessUnlessGranted(ScoreVoter::EDIT, $score);

        if (null !== $error = $this->rejectBadCsrf($request, $translator)) {
            return $error;
        }

        try {
            $payload = $this->decode($request);
        } catch (JsonException) {
            return $this->badRequest($translator->trans('api.invalid_json'));
        }

        if (null !== $title = $this->readTitle($payload)) {
            $score->setTitle($title);
        }

        $purgeNeeded = false;

        if (array_key_exists('content', $payload)) {
            try {
                $content = $validator->validate($payload['content']);
            } catch (ScoreContentException $exception) {
                return $this->unprocessable($exception, $translator);
            }

            // The snapshot must be taken before the new content overwrites it.
            $purgeNeeded = $recorder->record($score, $content);
            $score->setContent($content);
        }

        $this->entityManager->flush();

        if ($purgeNeeded) {
            $recorder->purge($score);
        }

        return $this->json(['score' => $presenter->score($score)]);
    }

    #[Route('/{id}', name: 'delete', requirements: ['id' => Requirement::DIGITS], methods: ['DELETE'])]
    public function delete(
        #[MapEntity(id: 'id')]
        Score $score,
        Request $request,
        TranslatorInterface $translator,
    ): JsonResponse {
        $this->denyAccessUnlessGranted(ScoreVoter::DELETE, $score);

        if (null !== $error = $this->rejectBadCsrf($request, $translator)) {
            return $error;
        }

        $this->removeAndFlush($score);

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    /**
     * @return array<string, mixed>
     *
     * @throws JsonException
     */
    private function decode(Request $request): array
    {
        $raw = $request->getContent();

        if ('' === $raw) {
            return [];
        }

        $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);

        if (!is_array($decoded)) {
            throw new JsonException('Expected an object.');
        }

        return $decoded;
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function readTitle(array $payload): ?string
    {
        $title = $payload['title'] ?? null;

        if (!is_string($title)) {
            return null;
        }

        $title = trim($title);

        return '' === $title ? null : mb_substr($title, 0, 120);
    }

    private function rejectBadCsrf(Request $request, TranslatorInterface $translator): ?JsonResponse
    {
        $token = $request->headers->get('X-CSRF-Token', '');

        if ($this->isCsrfTokenValid(self::CSRF_TOKEN_ID, $token)) {
            return null;
        }

        return $this->json(
            ['error' => $translator->trans('api.invalid_csrf')],
            Response::HTTP_FORBIDDEN,
        );
    }

    private function badRequest(string $message): JsonResponse
    {
        return $this->json(['error' => $message], Response::HTTP_BAD_REQUEST);
    }

    private function unprocessable(
        ScoreContentException $exception,
        TranslatorInterface $translator,
    ): JsonResponse {
        return $this->json([
            'error' => $translator->trans($exception->getKey(), $exception->getParameters()),
            'path' => $exception->getPath(),
        ], Response::HTTP_UNPROCESSABLE_ENTITY);
    }
}
