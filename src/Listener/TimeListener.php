<?php

declare(strict_types=1);

namespace App\Listener;

use App\Interface\TimeInterface;
use DateTimeImmutable;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\ORM\Event\OnFlushEventArgs;
use Doctrine\ORM\Event\PrePersistEventArgs;
use Doctrine\ORM\Events;

/**
 * Fills createdAt / updatedAt so no caller has to remember to.
 */
#[AsDoctrineListener(event: Events::prePersist)]
#[AsDoctrineListener(event: Events::onFlush)]
final class TimeListener
{
    public function prePersist(PrePersistEventArgs $args): void
    {
        $entity = $args->getObject();

        if (!$entity instanceof TimeInterface) {
            return;
        }

        $now = new DateTimeImmutable();

        if (null === $entity->getCreatedAt()) {
            $entity->setCreatedAt($now);
        }

        $entity->setUpdatedAt($now);
    }

    /**
     * Updates are stamped in onFlush rather than preUpdate: preUpdate runs after
     * the change set has been computed, so a value written there is dropped
     * unless the change set is recomputed by hand.
     */
    public function onFlush(OnFlushEventArgs $args): void
    {
        $manager = $args->getObjectManager();
        $unitOfWork = $manager->getUnitOfWork();
        $now = new DateTimeImmutable();

        foreach ($unitOfWork->getScheduledEntityUpdates() as $entity) {
            if (!$entity instanceof TimeInterface) {
                continue;
            }

            $entity->setUpdatedAt($now);
            $unitOfWork->recomputeSingleEntityChangeSet(
                $manager->getClassMetadata($entity::class),
                $entity,
            );
        }
    }
}
