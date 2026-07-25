<?php

declare(strict_types=1);

namespace App\Interface;

use DateTimeImmutable;

interface TimeInterface extends IdInterface
{
    public function getCreatedAt(): ?DateTimeImmutable;

    public function setCreatedAt(?DateTimeImmutable $createdAt): static;

    public function getUpdatedAt(): ?DateTimeImmutable;

    public function setUpdatedAt(?DateTimeImmutable $updatedAt): static;
}
