<?php

declare(strict_types=1);

namespace App\Command;

use App\Entity\User;
use App\Enum\AvatarIcon;
use App\Repository\UserRepository;
use App\Security\PinCodeHasher;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

use function sprintf;

/**
 * Bootstraps the first administrator. Afterwards, profiles are managed from
 * the admin dashboard.
 */
#[AsCommand(
    name: 'app:user:create',
    description: 'Create an admin (password) or child (4-digit PIN) profile.',
)]
final class CreateUserCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly UserRepository $repository,
        private readonly UserPasswordHasherInterface $hasher,
        private readonly PinCodeHasher $pinHasher,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addArgument('username', InputArgument::REQUIRED, 'Login identifier, lowercase')
            ->addArgument('secret', InputArgument::REQUIRED, 'Password for an admin, 4 digits for a child')
            ->addOption('display-name', 'd', InputOption::VALUE_REQUIRED, 'Name shown in the interface')
            ->addOption('child', 'c', InputOption::VALUE_NONE, 'Create a child profile instead of an admin')
            ->addOption('avatar', 'a', InputOption::VALUE_REQUIRED, 'Tabler icon name for the avatar', 'music');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        /** @var string $username */
        $username = $input->getArgument('username');
        /** @var string $secret */
        $secret = $input->getArgument('secret');
        $isChild = (bool) $input->getOption('child');

        if (null !== $this->repository->findOneByUsername($username)) {
            $io->error(sprintf('L\'identifiant "%s" est déjà pris.', $username));

            return Command::FAILURE;
        }

        if ($isChild && 1 !== preg_match('/^\d{4}$/', $secret)) {
            $io->error('Le code d\'un profil enfant doit faire exactement 4 chiffres.');

            return Command::FAILURE;
        }

        /** @var string $avatarValue */
        $avatarValue = $input->getOption('avatar');
        $avatar = AvatarIcon::tryFrom($avatarValue);

        if (!$avatar instanceof AvatarIcon) {
            $io->error(sprintf(
                'Avatar inconnu "%s". Valeurs possibles : %s.',
                $avatarValue,
                implode(', ', array_column(AvatarIcon::cases(), 'value')),
            ));

            return Command::FAILURE;
        }

        /** @var string|null $displayName */
        $displayName = $input->getOption('display-name');

        $user = (new User())
            ->setUsername($username)
            ->setDisplayName($displayName ?? ucfirst($username))
            ->setRoles([$isChild ? User::ROLE_CHILD : User::ROLE_ADMIN])
            ->setAvatarIcon($avatar);

        if ($isChild) {
            $user->setPinCode($this->pinHasher->hash($user, $secret));
        } else {
            $user->setPassword($this->hasher->hashPassword($user, $secret));
        }

        $this->entityManager->persist($user);
        $this->entityManager->flush();

        $io->success(sprintf(
            'Profil %s "%s" créé.',
            $isChild ? 'enfant' : 'administrateur',
            $user->getDisplayName(),
        ));

        return Command::SUCCESS;
    }
}
