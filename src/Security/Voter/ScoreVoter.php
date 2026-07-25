<?php

declare(strict_types=1);

namespace App\Security\Voter;

use App\Entity\Score;
use App\Entity\User;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

use function in_array;

/**
 * A child sees and edits only their own scores. An admin sees everything.
 *
 * @extends Voter<string, Score>
 */
final class ScoreVoter extends Voter
{
    public const string VIEW = 'SCORE_VIEW';
    public const string EDIT = 'SCORE_EDIT';
    public const string DELETE = 'SCORE_DELETE';

    protected function supports(string $attribute, mixed $subject): bool
    {
        return in_array($attribute, [self::VIEW, self::EDIT, self::DELETE], true)
            && $subject instanceof Score;
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool
    {
        $user = $token->getUser();

        if (!$user instanceof User) {
            return false;
        }

        if ($user->isAdmin()) {
            return true;
        }

        return $subject->getOwner()?->getId() === $user->getId();
    }
}
