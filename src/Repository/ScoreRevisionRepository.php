<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Score;
use App\Entity\ScoreRevision;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<ScoreRevision>
 */
class ScoreRevisionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, ScoreRevision::class);
    }

    /**
     * @return list<ScoreRevision>
     */
    public function findByScore(Score $score): array
    {
        return $this->createQueryBuilder('r')
            ->andWhere('r.score = :score')
            ->setParameter('score', $score)
            ->orderBy('r.createdAt', 'DESC')
            ->addOrderBy('r.id', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Deletes every revision of a score beyond the newest $keep.
     */
    public function purgeBeyond(Score $score, int $keep): int
    {
        /** @var list<int> $ids */
        $ids = $this->createQueryBuilder('r')
            ->select('r.id')
            ->andWhere('r.score = :score')
            ->setParameter('score', $score)
            ->orderBy('r.createdAt', 'DESC')
            ->addOrderBy('r.id', 'DESC')
            ->setFirstResult($keep)
            ->getQuery()
            ->getSingleColumnResult();

        if ([] === $ids) {
            return 0;
        }

        return (int) $this->createQueryBuilder('r')
            ->delete()
            ->andWhere('r.id IN (:ids)')
            ->setParameter('ids', $ids)
            ->getQuery()
            ->execute();
    }
}
