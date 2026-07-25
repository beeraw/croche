# Croche

Une application web de notation musicale pour enfants.

Croche n'est pas un éditeur de partition professionnel. C'est un outil pour un
enfant qui lit déjà des partitions simples et veut écrire ses propres morceaux,
les entendre, et surtout ne pas les perdre. Pensé pour l'iPad, au doigt.

- Grande portée piano (clé de sol + clé de fa, accolade, mesures alignées)
- Saisie au clavier de piano virtuel ou par tap sur la portée
- Lecture audio des deux portées avec curseur qui suit
- Sauvegarde automatique, historique des révisions
- Impression propre, pour transformer le morceau en vraie partition papier

---

## Prérequis

- PHP 8.3 ou plus, avec les extensions `ctype`, `iconv`, `json`, `pdo_mysql`
- Composer 2
- Node.js 20 ou plus, npm
- MariaDB 10.11 ou plus (ou MySQL 8)

## Installation

```bash
git clone https://github.com/beeraw/croche.git
cd croche
composer install
npm install
```

Créez un fichier `.env.local` — jamais commité — avec vos identifiants réels :

```dotenv
DATABASE_URL="mysql://root:root@127.0.0.1:3306/croche?serverVersion=mariadb-10.11.0&charset=utf8mb4"
APP_SECRET=une-chaine-aleatoire-de-32-caracteres
```

Le `.env` versionné ne contient qu'un DSN d'exemple.

Créez la base et jouez les migrations :

```bash
php bin/console doctrine:database:create
php bin/console doctrine:migrations:migrate --no-interaction
```

Chargez les fixtures (un administrateur, un profil enfant, deux morceaux) :

```bash
php bin/console doctrine:fixtures:load --no-interaction
```

## Lancement

Compilez les assets, puis démarrez le serveur :

```bash
npm run dev
```

```bash
symfony server:start
```

En développement, `npm run watch` recompile à la volée.

Pour la production :

```bash
npm run build
```

## Comptes de démonstration

Fournis par les fixtures, avec des prénoms fictifs. À supprimer avant toute
mise en ligne réelle.

| Rôle | Identifiant | Secret |
| --- | --- | --- |
| Administrateur | `admin` | `admin` |
| Enfant (Aïcha) | tuile de profil | code `2018` |

Recharger les fixtures recrée les partitions avec de nouveaux identifiants :
un onglet resté ouvert sur `/morceaux/12` tombera sur une page « ce morceau
n'existe plus ». C'est normal, et c'est le seul effet de bord.

## Tests

Deux suites, indépendantes l'une de l'autre.

**PHPUnit** couvre la validation du document, l'API, le Voter, la limitation de
tentatives sur le code PIN, la purge des révisions et le changement de langue.
Elle tourne sur un SQLite jeté dans `var/` : aucune base MariaDB n'est
nécessaire, et rien en dehors de `croche` n'est touché.

```bash
composer test
```

**Playwright** couvre ce que seul un vrai navigateur peut montrer : le rendu
VexFlow, la saisie au doigt, le refus d'une mesure pleine, l'undo, l'autosave,
la feuille d'impression, et la mesure du timbre de piano rendu hors ligne.

Elle a besoin d'une instance qui tourne et des fixtures chargées :

```bash
php bin/console doctrine:fixtures:load --no-interaction && npm run build
```

```bash
npm run test:e2e
```

L'adresse visée est `https://croche` ; passez `CROCHE_BASE_URL` pour en changer.
La première fois, `npx playwright install` télécharge les navigateurs.

### Navigateurs couverts

| Moteur | Pourquoi | État |
| --- | --- | --- |
| WebKit | l'iPad, la cible réelle | 33/33 |
| Chromium | Chrome, Edge, et la majorité du parc | 33/33 |
| iPad (gen 7) | WebKit, mais en tactile et en portrait | 33/33 |
| Firefox | moteur indépendant, attrape ce que les deux autres partagent | non exécuté ici |

La suite Firefox est configurée mais n'a jamais tourné : sur la machine de
développement, le bac à sable de macOS refusait de lancer le
`plugin-container` de Firefox. Les trois autres projets passent intégralement.
Si `npm run test:e2e` échoue au lancement de Firefox chez vous aussi, retirez
le projet de `playwright.config.js` — les trois autres suffisent à couvrir
Blink et WebKit.

---

## API

Contrôleurs Symfony classiques, réponses JSON. Les appels mutants exigent un
jeton CSRF dans l'en-tête `X-CSRF-Token`, et tout accès à une partition
existante passe par `ScoreVoter`.

| Méthode | Route | Effet |
| --- | --- | --- |
| `GET` | `/api/scores` | ses partitions (toutes, pour un admin) |
| `GET` | `/api/scores/{id}` | une partition, contenu compris |
| `POST` | `/api/scores` | création |
| `PUT` | `/api/scores/{id}` | mise à jour — c'est ce qu'appelle l'autosave |
| `DELETE` | `/api/scores/{id}` | suppression |

Le JSON reçu est validé contre le schéma attendu et **reconstruit clé par clé** :
rien d'inattendu n'atteint la base. Un document mal formé repart en `422` avec
le chemin fautif.

## Commandes utiles

Créer un administrateur, puis un profil enfant :

```bash
php bin/console app:user:create admin motdepasse --display-name="Administration"
```

```bash
php bin/console app:user:create aicha 2018 --child --display-name=Aïcha --avatar=cat
```

```bash
composer cs-check
```

```bash
php bin/console ux:icons:import tabler:nom-de-licone
```

---

## Zéro requête sortante

C'est une contrainte structurante du projet, pas une préférence :

- aucune librairie JS par CDN — tout passe par npm et Webpack Encore ;
- aucune police distante — Nunito est dans `assets/fonts/`, Bravura et Academico
  sont embarquées en base64 dans le bundle VexFlow ;
- les icônes Tabler sont vendorisées dans `assets/icons/tabler/`, et
  `ux_icons.iconify.enabled` est à `false` ;
- l'audio est synthétisé en Web Audio, sans soundfont ni échantillon : le
  timbre de piano est calculé, il ne pèse pas un octet.

`symfony/http-client` est en `require-dev` : une installation de production n'a
tout simplement pas de quoi émettre une requête HTTP sortante.

---

## Architecture

### Modèle de données

Trois entités seulement.

```
User            id, username, displayName, roles[], password, pinCode, avatarIcon, …
Score           id, owner, title, content (JSON), createdAt, updatedAt
ScoreRevision   id, score, content (JSON), createdAt
```

Une partition est un **document**, pas un ensemble de lignes SQL. Les notes
vivent dans la colonne JSON `Score.content` :

```json
{
  "schemaVersion": 1,
  "keySignature": "C",
  "timeSignature": "4/4",
  "tempo": 90,
  "staves": [
    {
      "clef": "treble",
      "measures": [
        { "notes": [{ "keys": ["c/4"], "duration": "q", "accidental": null, "rest": false }] }
      ]
    },
    {
      "clef": "bass",
      "measures": [
        { "notes": [{ "keys": ["c/3"], "duration": "h", "accidental": null, "rest": false }] }
      ]
    }
  ]
}
```

`schemaVersion` est présent dès la version 1 : le format pourra évoluer sans
migration SQL.

**Invariant** : les deux portées ont toujours le même nombre de mesures. Il est
garanti côté client (`ScoreDocument`) et revalidé côté serveur
(`ScoreContentValidator`) : une requête qui l'enfreint est rejetée en 422.

### Découpage

```
src/
  Controller/          Api/, Admin/, plus accueil, langue, enfant et sécurité
  Entity/              User, Score, ScoreRevision
  Repository/
  Security/            authenticators, PinCodeHasher, PinCodeThrottle, ScoreVoter
  Score/               ScoreSchema, ScoreContentValidator, ScoreFactory,
                       ScoreRevisionRecorder, ScorePresenter
  Trait/, Interface/   IdTrait, TimeTrait et leurs contrats
  Listener/            TimeListener, LocaleSubscriber
  Enum/                AvatarIcon, AppLocale
assets/
  controllers/         un contrôleur Stimulus par responsabilité
  js/score/            ScoreDocument, ScoreRenderer, UndoStack, pitch helpers
  js/audio/            AudioEngine
  styles/              _variables, _mixins, puis un fichier par composant
translations/          messages.fr.yaml, messages.en.yaml
tests/
  Unit/, Functional/   PHPUnit
  e2e/                 Playwright
```

### Contrôleurs Stimulus

| Contrôleur | Responsabilité |
| --- | --- |
| `score-editor` | orchestre le document, le rendu, la sélection, l'undo |
| `piano-keyboard` | clavier virtuel, mode de saisie principal |
| `playback` | lecture, curseur, tempo |
| `autosave` | debounce 2 s, `PUT`, indicateur, tampon `localStorage` |
| `note-palette` | durées, silences, altérations |
| `pin-pad` | pavé numérique à 4 chiffres |

---

## Décisions prises

Choix tranchés en cours de route, à revoir librement.

- **Symfony 7.4 (LTS)** plutôt qu'une 7.x plus ancienne : c'est la dernière
  branche 7 et elle supporte officiellement PHP 8.4 et 8.5.
- **VexFlow 5 via l'entrée `vexflow/bravura`** plutôt que l'entrée par défaut :
  elle embarque Bravura et Academico mais pas Petaluma ni Gonville, ce qui
  économise environ 300 Ko de bundle pour des polices qu'on n'utilise pas.
- **Nunito repris de mes autres projets** (fichiers `woff2` Google Fonts,
  sous-ensembles latin et latin-ext), copiés en local et renommés lisiblement.
  Deux fichiers suffisent pour du français.
- **Deux portées, pas plus.** Le modèle autorise un tableau `staves`, mais tout
  l'éditeur suppose exactement deux entrées (sol puis fa). Généraliser
  demanderait de revoir le rendu et le clavier.
- **Une mesure vide contient un silence de la durée de la mesure**, généré à la
  volée au rendu plutôt que stocké. Le document reste ainsi le reflet exact de
  ce que l'enfant a saisi.
- **Débordement de mesure : refus pur et simple**, avec un flash rouge sur la
  mesure et un message. Pas de complétion automatique par des silences, pas de
  report sur la mesure suivante : déroutant pour un enfant.
- **Undo/redo par instantanés** du document complet (50 niveaux) plutôt que par
  commandes inversibles. Le document fait quelques kilo-octets, la simplicité
  vaut mieux ici que l'élégance.
- **Le code PIN est haché avec le même hasher que les mots de passe**
  (bcrypt, coût 12). Quatre chiffres restent quatre chiffres : la vraie défense
  est la limitation de tentatives (5 essais, puis blocage progressif).
- **Limitation de tentatives en base**, sur `User`, plutôt que via
  `symfony/rate-limiter` : la contrainte doit suivre le profil et survivre au
  changement d'appareil, pas être attachée à une IP.
- **Pas de bouton « Enregistrer ».** Autosave en debounce de 2 s, indicateur
  discret. `localStorage` sert de tampon en cas d'échec réseau et propose une
  restauration à la réouverture, mais la base fait foi.
- **Vingt révisions conservées par partition**, purgées à l'écriture. Une
  révision n'est créée que si le contenu a réellement changé.
- **Audio v1 : synthèse additive par table d'ondes et filtre dynamique**, et
  non un simple oscillateur triangle avec enveloppe ADSR — ce dernier sonnait
  « jouet ». Une `PeriodicWave` de 14 harmoniques en 1/n^1.2, avec un léger
  renfort des partiels 2 à 4 où se joue la présence, construite une seule fois.
  Elle traverse un passe-bas qui s'ouvre large à l'attaque (7 à 11 × la
  fondamentale, jamais sous 5 kHz pour que les graves gardent leur définition)
  puis se referme lentement sur la note. L'enveloppe est percutante — attaque
  de 4 ms puis décroissance exponentielle continue, jamais de plateau de
  sustain — et un bruit de marteau assez présent détache chaque note dans un
  trait rapide.

  Trois réglages nommés en haut de la classe : `brightness`, `resonance` et
  `hammer`. Le registre agit sur tout : durée de résonance, coupure du filtre,
  et un `registerTilt` qui baisse le grave d'environ 3 dB pour que la main
  gauche ne couvre pas la mélodie. Mesuré hors ligne sur un la4 : énergie des
  harmoniques 4 à 10 divisée par deux entre le début et la fin de la note ;
  un do grave garde 25 % de son niveau à 0,9 s, un do aigu moins de 1 %. Sur
  « Ma première gamme », qui empile des croches sur une ronde de basse, la
  crête reste à 0,39 sans un seul échantillon écrêté. Budget : un oscillateur,
  un filtre, un gain par note, plus deux nœuds éphémères pour le marteau.
- **Feuille de style d'impression en entrée Encore séparée**, chargée en
  `media="print"`. Elle ne peut pas polluer l'affichage écran.
- **Jetons CSRF classiques, adossés à la session**, plutôt que le mode
  « stateless » (double cookie) de Symfony 7.2+. Ce dernier obligerait le
  JavaScript à participer à chaque envoi, y compris aux `fetch` de l'éditeur.
  L'API lit son jeton dans l'en-tête `X-CSRF-Token`.
- **`serverVersion=mariadb-10.11.0` et non `mariadb-10.11`** dans le DSN :
  DBAL 4 exige un numéro de version complet `major.minor.patch` et refuse la
  forme abrégée.
- **`symfony/http-client` est en `require-dev`.** Il n'est utile qu'à
  `ux:icons:import`, au moment de vendoriser une icône. En production, l'app
  n'a même pas de quoi émettre une requête sortante.
- **Le bandeau de portée active est dessiné dans le SVG**, pas en HTML
  au-dessus : il suit ainsi le découpage en systèmes sans calcul de position.
  Il est isolé dans un groupe `vf-active-stave` que l'impression masque.
- **`window.crocheApp` expose l'application Stimulus.** Pratique pour
  inspecter l'éditeur depuis la console quand quelque chose cloche sur l'iPad.
- **Langue en session, pas dans l'URL.** Les adresses restent identiques en
  français et en anglais : le raccourci de l'iPad continue de marcher quelle que
  soit la langue. Le premier passage suit la préférence du navigateur, puis
  bascule sur le français. Le code, les routes et les clés de traduction
  restent en anglais ; seule l'interface est traduite.
- **Les noms de notes viennent du catalogue.** Do-Ré-Mi en français, C-D-E en
  anglais : c'est la même touche de piano, mais pas la même façon de la lire.
- **Les tests PHP tournent sur SQLite**, pas sur MariaDB. Un contributeur n'a
  rien à installer, et la consigne de ne toucher qu'à la base `croche` est
  respectée. Le schéma est construit depuis le mapping, les migrations étant
  spécifiques à MySQL. Contrepartie assumée : une régression propre à MariaDB
  échapperait à cette suite.
- **Pas de mode sombre**, et pas de framework CSS : les deux ajouteraient plus
  de surface que de valeur ici.

---

## Licences

Le **code** de Croche est sous licence [MIT](LICENSE).

Certains **assets embarqués** relèvent d'autres licences, toutes compatibles
avec une diffusion MIT mais assorties de leurs propres obligations :

- **Nunito** (interface) — SIL Open Font License 1.1
- **Bravura** (glyphes musicaux, via VexFlow) — SIL OFL 1.1, avec « Bravura »
  comme nom de police réservé : une version modifiée doit être renommée
- **Academico** (texte, via VexFlow) — SIL OFL 1.1
- **Tabler Icons** — MIT
- **Twig** — BSD-3-Clause

Le détail — auteurs, versions, obligations, texte de l'OFL — est dans
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Aucune dépendance sous GPL, AGPL ou CC-BY-NC n'est utilisée, et il ne faut pas
en introduire : cela rendrait le projet indiffusable sous MIT.
