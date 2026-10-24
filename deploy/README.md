# Production sous Docker (rossem)

Croche tourne sur rossem (145.239.10.80) à côté d'autres sites servis par le Caddy, le PHP-FPM et la MariaDB de
l'hôte. Croche passe sous Docker, base comprise, comme Stetboard ; rien ne change pour les autres sites.

## Principe

- **Une image système, sans le code** (`Dockerfile`, `docker/`) : PHP 8.5.12 sous FrankenPHP, les extensions (`intl`,
  `pdo_mysql`, `opcache`) et composer. Elle est construite **sur rossem**, par le script de livraison, seulement quand
  `Dockerfile` ou `docker/` change. Pas de registre, pas de jeton.
- **Le code reste le checkout git** `/var/www/croche.beeraw.yt/_online`, monté sur `/app`, avec son `.env.local` et
  `var/` (cache, journaux, sessions).
- **Deux conteneurs** (`deploy/production/compose.yaml`), sur le réseau Docker du projet :
  - `app` : FrankenPHP, publié sur `127.0.0.1:8101` ;
  - `database` : MariaDB 12.3, ses fichiers dans `/srv/croche-production/mysql`, publiée sur `127.0.0.1:3317` pour un
    administrateur du serveur. La MariaDB de l'hôte ne sert plus Croche après la bascule.

  Il n'y a ni `worker` ni `cron` : Croche n'a ni transport Messenger, ni mailer, ni commande planifiée, et la crontab de
  `deploy` ne contient aucune ligne pour lui.

  `app` tourne en `deploy:www-data` (1001:33), l'identité de l'ancien PHP-FPM. Il lit son `DATABASE_URL` dans le compose,
  qui l'emporte sur celle du `.env.local` du checkout ; celle-ci continue de désigner l'ancienne base, ce dont le retour
  arrière a besoin.
- **`/srv/croche-production`** contient `compose.yaml` (une copie, que `croche-deploy` remet à jour quand un commit le
  modifie), `.env` (ports et mots de passe de la base, tirés au hasard) et `mysql/`.
- **Le Caddy de l'hôte** garde le HTTPS et les filtres (`block_probes`, `block_bots`, HSTS, journal d'accès) et transmet à
  `127.0.0.1:8101`. Aucun autre bloc du Caddyfile ne renvoie vers `croche.beeraw.yt` : pas de redirection à conserver.
- **Les sessions** sont des fichiers de `var/sessions/<env>` dans le checkout (`config/packages/framework.yaml`), pour
  survivre aux livraisons.
- **Une livraison** (`deploy/server/croche-deploy`, lancée par le workflow GitHub à chaque push sur `main`) : `git pull`,
  puis seulement ce que le commit demande (image, composer, front), migrations, cache, redémarrage, attente de
  `/healthz`. La base n'est jamais redémarrée par une livraison.

Avant ce montage, il n'y avait ni workflow ni service : la livraison était `bin/pull` lancé à la main sur le serveur
(`git pull`, composer, yarn, rechargement de PHP-FPM). Ce script, ignoré par git, devient inutile après la bascule.

## Bascule

Elle passe par `deploy/production/cutover`, une phase à la fois, en root. Chaque phase dit ce qu'elle a changé et en
combien de temps. Le retour arrière marche depuis n'importe quelle phase.

**Ne pas pousser sur `main` avant la fin de la bascule** : le workflow appelle `croche-deploy`, qui n'existe pas encore
sur le serveur, puis livrerait dans des conteneurs dont la base est vide.

### Avant le jour J

1. Docker est déjà installé sur rossem (Stetboard). Vérifier que les ports `8101` et `3317` sont libres :
   `ss -ltn | grep -E ':(8101|3317) '` ne doit rien afficher.

2. Créer les quatre secrets du dépôt GitHub `beeraw/croche` (Settings, Secrets and variables, Actions) : `MAIN_HOST`,
   `MAIN_PORT`, `MAIN_USERNAME` (`deploy`) et `MAIN_KEY` (clé privée SSH de cet utilisateur), avec les mêmes valeurs que
   pour Stetboard.

3. Autoriser l'utilisateur du workflow à lancer le script de livraison, et lui seul, dans `/etc/sudoers.d/croche-deploy`
   (`sudo visudo -f /etc/sudoers.d/croche-deploy`) :

   ```
   deploy ALL=(root) NOPASSWD: /usr/local/bin/croche-deploy /srv/croche-production *
   ```

4. Le remote du checkout est en HTTPS (`https://github.com/beeraw/croche.git`) : le `git fetch` de la livraison marche
   parce que le dépôt est public, sans clé. Si le dépôt devient privé, passer le remote en SSH
   (`git remote set-url origin git@github.com:beeraw/croche.git`, la clé de `deploy` étant autorisée sur GitHub).

5. Récupérer le script de bascule du commit à livrer, sans toucher au checkout qui sert le site :

   ```bash
   sudo -u deploy git -C /var/www/croche.beeraw.yt/_online fetch origin
   sudo -u deploy git -C /var/www/croche.beeraw.yt/_online show <commit>:deploy/production/cutover | sudo tee /root/croche-cutover >/dev/null
   sudo chmod 700 /root/croche-cutover
   ```

6. Préparer, toujours sans toucher au site :

   ```bash
   sudo /root/croche-cutover prepare <commit>
   ```

   Ce que fait cette phase :
   - elle crée `/srv/croche-production`, avec son `.env` et des mots de passe tirés au hasard ;
   - elle note l'ancien commit et la dernière migration de l'ancien site, pour le retour arrière ;
   - elle installe `compose.yaml` et `croche-deploy` du commit ;
   - elle construit l'image et démarre la base, vide ;
   - elle écrit et valide deux Caddyfiles : maintenance et conteneurs.

### Le jour J (une ou deux minutes de coupure)

```bash
sudo /root/croche-cutover freeze    # page de maintenance
sudo /root/croche-cutover data      # copie de la base de l'hôte dans le conteneur
sudo /root/croche-cutover start     # croche-deploy : checkout sur le commit, composer sans dev, front, migrations, app
sudo /root/croche-cutover open      # Caddy vers les conteneurs, fin de la coupure
```

La crontab de `deploy` n'est pas touchée (aucune ligne Croche), non plus qu'aucun service systemd.

Puis vérifier le site (`https://croche.beeraw.yt`, choix d'un profil, un morceau ouvert et sauvegardé) et pousser sur `main`
le commit livré : la première livraison automatique doit finir par « Livré ». Les sessions de PHP-FPM ne sont pas reprises :
chaque enfant devra ressaisir son code une fois.

### Retour arrière

```bash
sudo /root/croche-cutover rollback
```

Après `open`, il remet la page de maintenance et arrête le conteneur. Il recopie ensuite la base du conteneur dans celle
de l'hôte, pour ne rien perdre de ce qui a été saisi depuis la bascule, puis ramène les migrations à la dernière que
connaissait l'ancien site. Dans tous les cas, il remet le checkout sur l'ancien commit, avec ses dépendances et son front,
rétablit l'ancien Caddyfile et recharge PHP-FPM.

### Après la bascule

Une fois le site stable, ces fichiers peuvent être supprimés : `bascule.sql`, `Caddyfile.avant-bascule`,
`Caddyfile.maintenance` et `Caddyfile.containers`. L'ancienne base `croche` de la MariaDB de l'hôte peut être supprimée à
son tour, ainsi que `bin/pull` du checkout.

## Sur le Mac

La même image et le même conteneur de base servent le site de développement, sur `https://croche.local.beeraw.yt` (le
Caddy du Mac transmet à `127.0.0.1:8101`) : `deploy/local/compose.yaml`, environnement `dev`. Croche n'envoie aucun mail,
donc rien n'est à rediriger. La base du conteneur, publiée sur `127.0.0.1:3327`, est la base de développement :
`bin/console` lancé sur le Mac s'y connecte (`.env.dev`). `deploy/local/load-database` la remplace par la base `croche`
du MariaDB du Mac. Les tests PHPUnit restent sur SQLite. Commandes dans `README.md`, section « Docker on the Mac ».

## Au quotidien

```bash
cd /srv/croche-production
sudo docker compose ps
sudo docker compose logs -f --tail 100 app
sudo docker compose exec app php bin/console …
sudo docker compose exec database sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" croche'
```

Livrer un commit précis, ou revenir en arrière : onglet **Actions** du dépôt, workflow « CD main », **Run workflow**,
champ « Commit à livrer ».
