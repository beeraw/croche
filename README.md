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
git clone https://github.com/<votre-compte>/croche.git
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
| Enfant (Lison) | tuile de profil | code `1234` |

## Commandes utiles

Créer un administrateur, puis un profil enfant :

```bash
php bin/console app:user:create admin motdepasse --display-name="Administration"
```

```bash
php bin/console app:user:create lison 1234 --child --display-name=Lison --avatar=cat
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
- l'audio est synthétisé en Web Audio, sans soundfont à télécharger.

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
  Controller/          Api/, Admin/, plus les contrôleurs enfant et sécurité
  Entity/              User, Score, ScoreRevision
  Repository/
  Security/            authenticators, PinCodeThrottle, ScoreVoter
  Score/               ScoreContentValidator, ScoreFactory, ScoreRevisionRecorder
  Trait/, Interface/   IdTrait, TimeTrait et leurs contrats
assets/
  controllers/         un contrôleur Stimulus par responsabilité
  js/score/            ScoreDocument, ScoreRenderer, UndoStack, pitch helpers
  js/audio/            AudioEngine
  styles/              _variables, _mixins, puis un fichier par composant
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
- **Feuille de style d'impression en entrée Encore séparée**, chargée en
  `media="print"`. Elle ne peut pas polluer l'affichage écran.
- **Pas de mode sombre**, pas de framework CSS, pas de tests automatisés dans
  cette première passe : le périmètre était déjà large.

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
