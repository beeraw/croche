<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Initial schema: user profiles, scores and their revision history.
 */
final class Version20260725035506 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create the user, score and score_revision tables.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE score (title VARCHAR(120) NOT NULL, content JSON NOT NULL, created_at DATETIME DEFAULT NULL, updated_at DATETIME DEFAULT NULL, id INT AUTO_INCREMENT NOT NULL, owner_id INT NOT NULL, INDEX IDX_329937517E3C61F9 (owner_id), INDEX IDX_329937517E3C61F943625D9F (owner_id, updated_at), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE score_revision (content JSON NOT NULL, created_at DATETIME NOT NULL, id INT AUTO_INCREMENT NOT NULL, score_id INT NOT NULL, INDEX IDX_9A60CAB412EB0A51 (score_id), INDEX IDX_9A60CAB412EB0A518B8E8428 (score_id, created_at), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE `user` (username VARCHAR(60) NOT NULL, display_name VARCHAR(60) NOT NULL, roles JSON NOT NULL, password VARCHAR(255) DEFAULT NULL, pin_code VARCHAR(255) DEFAULT NULL, avatar_icon VARCHAR(40) NOT NULL, pin_failed_attempts INT DEFAULT 0 NOT NULL, pin_locked_until DATETIME DEFAULT NULL, created_at DATETIME DEFAULT NULL, updated_at DATETIME DEFAULT NULL, id INT AUTO_INCREMENT NOT NULL, UNIQUE INDEX UNIQ_8D93D649F85E0677 (username), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE score ADD CONSTRAINT FK_329937517E3C61F9 FOREIGN KEY (owner_id) REFERENCES `user` (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE score_revision ADD CONSTRAINT FK_9A60CAB412EB0A51 FOREIGN KEY (score_id) REFERENCES score (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE score DROP FOREIGN KEY FK_329937517E3C61F9');
        $this->addSql('ALTER TABLE score_revision DROP FOREIGN KEY FK_9A60CAB412EB0A51');
        $this->addSql('DROP TABLE score');
        $this->addSql('DROP TABLE score_revision');
        $this->addSql('DROP TABLE `user`');
    }
}
