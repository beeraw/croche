<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Score;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Score>
 */
class ScoreRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Score::class);
    }

    /**
     * @return list<Score>
     */
    public function findByOwner(User $owner): array
    {
        return $this->createQueryBuilder('s')
            ->andWhere('s.owner = :owner')
            ->setParameter('owner', $owner)
            ->orderBy('s.updatedAt', 'DESC')
            ->addOrderBy('s.id', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Every score, all profiles combined, for the admin dashboard.
     *
     * @return list<Score>
     */
    public function findAllWithOwner(): array
    {
        return $this->createQueryBuilder('s')
            ->addSelect('o')
            ->join('s.owner', 'o')
            ->orderBy('s.updatedAt', 'DESC')
            ->addOrderBy('s.id', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Highest "Titre (n)" suffix already used by this owner, so a duplicate can
     * pick the next free name.
     */
    public function countByOwnerAndTitlePrefix(User $owner, string $prefix): int
    {
        return (int) $this->createQueryBuilder('s')
            ->select('COUNT(s.id)')
            ->andWhere('s.owner = :owner')
            ->andWhere('s.title LIKE :prefix')
            ->setParameter('owner', $owner)
            ->setParameter('prefix', addcslashes($prefix, '%_').'%')
            ->getQuery()
            ->getSingleScalarResult();
    }
}
