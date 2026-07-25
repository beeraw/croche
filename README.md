# Croche

A music notation web app for children.

Croche is not a professional score editor. It is a tool for a child who already
reads simple sheet music and wants to write her own pieces, hear them, and above
all not lose them. Built for the iPad, for fingers.

- A full piano staff (treble and bass, braced, bars aligned)
- Notes entered on a virtual piano keyboard, or by tapping the staff
- Audio playback of both staves, with a cursor following the music
- Automatic saving, with a revision history
- Clean printing, to turn a piece into real sheet music on paper
- Installable on the iPad home screen, full screen

---

## What it looks like

Captures taken on an iPad in landscape, with the fixture data.

The home page speaks to the parent discovering the project. The child goes
straight for the button.

![The home page: the name, what the app does, and two buttons — enter, or go to the admin area](docs/screenshots/home.png)

Then two screens, and that is all: her tile, her four-digit code. No email
address, no password to remember.

| Choosing a profile | Typing the code |
| --- | --- |
| ![The profile picker, one tile per child: a cat icon and a first name](docs/screenshots/profiles.png) | ![The keypad, with four dots filling up as the digits are typed](docs/screenshots/pin.png) |

Her pieces, each with its number of bars and the date it was last touched.
Renaming, duplicating and deleting all happen from the card.

![The library: two cards, and a large "New piece" button](docs/screenshots/library.png)

The editor: the large staff at the top, the tools in the middle, the piano
keyboard at the bottom — wide enough for two hands, and it slides sideways to
reach the neighbouring octaves. The active staff is marked by a band, here the
treble.

![The editor, with "Twinkle little star" across both staves, the toolbar and the piano keyboard](docs/screenshots/editor.png)

### The guided tour

It starts on its own the first time, on each screen, and the help button plays
it again afterwards. Six steps on the library, sixteen in the editor.

| On the library | In the editor |
| --- | --- |
| ![The first bubble of the tour, pointing at the "New piece" button](docs/screenshots/library-tour.png) | ![A bubble of the editor tour, pointing at the piano keyboard](docs/screenshots/editor-tour.png) |

---

## Requirements

- PHP 8.5 or later, with the `ctype`, `iconv`, `json` and `pdo_mysql` extensions
- Composer 2
- Node.js 20 or later, Yarn 4 (`corepack enable` is enough to get it)
- MariaDB 10.11 or later (or MySQL 8)

## Installation

```bash
git clone https://github.com/beeraw/croche.git
cd croche
composer install
yarn install
```

Create a `.env.local` file — never committed — with your real credentials:

```dotenv
DATABASE_URL="mysql://root:root@127.0.0.1:3306/croche?serverVersion=mariadb-10.11.0&charset=utf8mb4"
APP_SECRET=a-random-32-character-string
```

The versioned `.env` holds nothing but an example DSN.

Create the database and run the migrations:

```bash
php bin/console doctrine:database:create
php bin/console doctrine:migrations:migrate --no-interaction
```

Load the fixtures (one administrator, one child profile, two pieces):

```bash
php bin/console doctrine:fixtures:load --no-interaction
```

## Running it

Compile the assets, then start the server:

```bash
yarn dev
```

```bash
symfony server:start
```

In development, `yarn watch` recompiles on the fly.

For production:

```bash
yarn build
```

## Demo accounts

Provided by the fixtures, with fictional first names. Delete them before
anything goes online for real.

| Role | Username | Secret |
| --- | --- | --- |
| Administrator | `admin` | `admin` |
| Child (Aïcha) | profile tile | code `2018` |

Reloading the fixtures recreates the scores with new identifiers: a tab left
open on `/morceaux/12` will land on a "this piece no longer exists" page. That
is normal, and it is the only side effect.

## Tests

Two suites, independent of each other.

**PHPUnit** covers document validation, the API, the Voter, the throttling of
PIN attempts, the revision purge, the language switch and the app manifest.
It runs on a SQLite file dropped in `var/`: no MariaDB database is needed, and
nothing outside `croche` is touched.

```bash
composer test
```

**Playwright** covers what only a real browser can show: the VexFlow rendering,
entry by finger, the refusal of a full bar, undo, autosave, the print sheet, the
measurement of the piano timbre rendered offline, and the manifest that makes
the app installable.

It needs a running instance and the fixtures loaded:

```bash
php bin/console doctrine:fixtures:load --no-interaction && yarn build
```

```bash
yarn test:e2e
```

The address aimed at is `https://croche`; pass `CROCHE_BASE_URL` to change it.
The first time, `yarn playwright install` downloads the browsers.

### Browsers covered

| Engine | Why | State |
| --- | --- | --- |
| WebKit | the iPad, the real target | 48/48 |
| Chromium | Chrome, Edge, and most of the field | 48/48 |
| iPad (gen 7) | WebKit, but touch and portrait | 48/48 |
| Firefox | an independent engine, catches what the other two share | not run here |

The Firefox suite is configured but has never run: on the development machine,
the macOS sandbox refused to launch Firefox's `plugin-container`. The other
three projects pass in full. If `yarn test:e2e` fails to launch Firefox on your
machine too, remove the project from `playwright.config.js` — the other three
are enough to cover Blink and WebKit.

---

## Quality

Four tools, none of them optional: the whole project is expected to stay at
zero findings.

| Tool | Covers | Command |
| --- | --- | --- |
| PHP-CS-Fixer | Symfony style, `declare(strict_types=1)`, PHP 8.5 idioms | `composer cs-check` / `cs-fix` |
| PHPStan | static analysis at level 6, Doctrine extension, **no baseline** | `composer phpstan` |
| Rector | automated modernisation — dead code 20, code quality 20 | `composer rector` / `rector-fix` |
| ESLint + Stylelint | `assets/`, the Playwright specs, and the SCSS | `yarn lint` |

`composer qa` chains the style check, PHPStan and PHPUnit — that is the gate to
pass before pushing.

```bash
composer qa && yarn lint
```

Rector stays out of `qa` on purpose: it rewrites code rather than judging it, so
it is run deliberately. Its type-coverage level is at 0, the one dial worth
raising by hand once the rest holds.

Git hooks come from [CaptainHook](https://captainhook.info); install them once
per clone, and the `pre-commit` hook then runs the PHP lint, the style check and
PHPStan on every commit:

```bash
vendor/bin/captainhook install
```

---

## API

Plain Symfony controllers, JSON responses. Mutating calls require a CSRF token
in the `X-CSRF-Token` header, and every access to an existing score goes through
`ScoreVoter`.

| Method | Route | Effect |
| --- | --- | --- |
| `GET` | `/api/scores` | her scores (all of them, for an admin) |
| `GET` | `/api/scores/{id}` | one score, content included |
| `POST` | `/api/scores` | creation |
| `PUT` | `/api/scores/{id}` | update — this is what autosave calls |
| `DELETE` | `/api/scores/{id}` | deletion |

The JSON received is validated against the expected schema and **rebuilt key by
key**: nothing unexpected reaches the database. A malformed document comes back
as a `422` with the offending path.

## Useful commands

Create an administrator, then a child profile:

```bash
php bin/console app:user:create admin password --display-name="Administration"
```

```bash
php bin/console app:user:create aicha 2018 --child --display-name=Aïcha --avatar=cat
```

```bash
php bin/console ux:icons:import tabler:icon-name
```

Regenerate the home screen icons after a change to the source artwork
(`assets/icons/croche-app-icon.svg`). Needs `rsvg-convert` and ImageMagick; the
PNGs produced are committed, so this is pointless for a plain install:

```bash
./bin/build-icons.sh
```

Regenerate the README screenshots. The script drives the instance the way the
child would — profile, code, library, editor — and goes over two screens again
with the guided tour open. Same requirements as the Playwright suite: a running
instance and freshly loaded fixtures, without which a piece left over from an
earlier run would end up in the image:

```bash
node bin/screenshots.mjs
```

---

## Zero outbound requests

This is a structural constraint of the project, not a preference:

- no JS library from a CDN — everything goes through Yarn and Webpack Encore;
- no remote font — Nunito lives in `assets/fonts/`, Bravura and Academico are
  embedded as base64 inside the VexFlow bundle;
- the Tabler icons are vendored in `assets/icons/tabler/`, and
  `ux_icons.iconify.enabled` is `false`;
- the audio is synthesised with Web Audio, with no soundfont and no sample: the
  piano timbre is computed, it does not weigh a single byte.

`symfony/http-client` is a `require-dev` dependency: a production install simply
has nothing to send an outbound HTTP request with.

---

## Architecture

### Data model

Three entities, no more.

```
User            id, username, displayName, roles[], password, pinCode, avatarIcon, …
Score           id, owner, title, content (JSON), createdAt, updatedAt
ScoreRevision   id, score, content (JSON), createdAt
```

A score is a **document**, not a set of SQL rows. The notes live in the
`Score.content` JSON column:

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

`schemaVersion` is there from version 1 onwards: the format will be able to
change without an SQL migration.

**Invariant**: the two staves always hold the same number of bars. It is
guaranteed on the client (`ScoreDocument`) and revalidated on the server
(`ScoreContentValidator`): a request that breaks it is rejected with a 422.

### Layout

```
src/
  Controller/          Api/, Admin/, plus home, language, child and security
  Entity/              User, Score, ScoreRevision
  Repository/
  Security/            authenticators, PinCodeHasher, PinCodeThrottle, ScoreVoter
  Score/               ScoreSchema, ScoreContentValidator, ScoreFactory,
                       ScoreRevisionRecorder, ScorePresenter
  Trait/, Interface/   IdTrait, TimeTrait and their contracts
  Listener/            TimeListener, LocaleSubscriber
  Enum/                AvatarIcon, AppLocale
assets/
  controllers/         one Stimulus controller per responsibility
  js/score/            ScoreDocument, ScoreRenderer, UndoStack, pitch helpers
  js/audio/            AudioEngine
  styles/              _variables, _mixins, then one file per component
translations/          one messages.<language>.yaml per language (fr, en, es, pt, de)
public/icons/          home screen icons, generated by bin/build-icons.sh
tests/
  Unit/, Functional/   PHPUnit
  e2e/                 Playwright
```

### Stimulus controllers

| Controller | Responsibility |
| --- | --- |
| `score-editor` | orchestrates the document, the rendering, the selection, the undo |
| `piano-keyboard` | virtual keyboard, the main way of entering notes |
| `playback` | playback, cursor, tempo |
| `autosave` | 2 s debounce, `PUT`, indicator, `localStorage` buffer |
| `note-palette` | durations, rests, accidentals |
| `pin-pad` | four-digit keypad |
| `tour` | guided tour, on the library and in the editor |

---

## Decisions taken

Calls made along the way, free to revisit.

- **Symfony 7.4 (LTS)** rather than an older 7.x: it is the last of the 7
  branch and it officially supports PHP 8.4 and 8.5.
- **Yarn 4, but with `nodeLinker: node-modules`.** The default Plug'n'Play mode
  does away with `node_modules`; Encore, Babel and Playwright all expect to find
  their packages on disk, and changing their minds costs patches this project
  has no reason to carry.
- **The Yarn version is pinned**, through `packageManager` in `package.json`.
  It was left open at first, on the idea that any 4.x would do. What actually
  happened is that the production server still had the Yarn 1.22 from before the
  migration: it does not know `--immutable`, ignores it, and quietly rewrote
  `yarn.lock` in the v1 format on every deploy — which broke the next `git pull`
  and, worse, meant production was resolving its dependencies itself instead of
  installing the ones that had been tested. Corepack reads that field and serves
  the right Yarn whatever is installed globally; without it, it falls back to a
  1.22 of its own.
- **Yarn's quarantine is left in place.** By default Yarn refuses any package
  published less than 24 hours ago — the window in which a registry compromise
  does the most damage. Two development dependencies came out fresh and were
  stepped down one notch (`@playwright/test` 1.61.1, `sass` 1.101.7) rather than
  lowering the barrier for everyone.
- **VexFlow 5 through the `vexflow/bravura` entry point** rather than the
  default one: it embeds Bravura and Academico but neither Petaluma nor
  Gonville, which saves about 300 KB of bundle for fonts we do not use.
- **Nunito carried over from my other projects** (Google Fonts `woff2` files,
  latin and latin-ext subsets), copied locally and renamed readably. Two files
  cover the five interface languages; a Cyrillic or Greek language would call
  for one more subset.
- **Two staves, no more.** The model allows a `staves` array, but the whole
  editor assumes exactly two entries (treble then bass). Generalising would mean
  reworking the rendering and the keyboard.
- **An empty bar holds a rest the length of the bar**, generated on the fly at
  render time rather than stored. The document thus stays an exact reflection of
  what the child entered.
- **Bar overflow: a flat refusal**, with a red flash on the bar and a message.
  No automatic padding with rests, no spilling onto the next bar: confusing for
  a child.
- **Undo/redo by snapshots** of the whole document (50 levels) rather than by
  invertible commands. The document is a few kilobytes; simplicity is worth more
  here than elegance.
- **The PIN code is hashed with the same hasher as passwords** (bcrypt, cost
  12). Four digits remain four digits: the real defence is the throttling
  (5 attempts, then a growing lockout).
- **Throttling in the database**, on `User`, rather than through
  `symfony/rate-limiter`: the constraint has to follow the profile and survive a
  change of device, not be attached to an IP.
- **No "Save" button.** Autosave on a 2 s debounce, with a quiet indicator.
  `localStorage` acts as a buffer when the network fails and offers to restore
  on reopening, but the database is the source of truth.
- **Twenty revisions kept per score**, purged on write. A revision is only
  created if the content really changed.
- **Audio v1: additive synthesis from a wave table with a dynamic filter**,
  rather than a plain triangle oscillator with an ADSR envelope — that one
  sounded like a toy. A `PeriodicWave` of 14 harmonics in 1/n^1.2, with a slight
  boost of partials 2 to 4 where presence lives, built once and for all. It goes
  through a low-pass that opens wide on the attack (7 to 11 × the fundamental,
  never below 5 kHz so the low notes keep their definition) then slowly closes
  over the note. The envelope is percussive — a 4 ms attack then a continuous
  exponential decay, never a sustain plateau — and a fairly present hammer noise
  detaches each note in a fast run.

  Three named settings at the top of the class: `brightness`, `resonance` and
  `hammer`. The register drives everything: resonance length, filter cutoff, and
  a `registerTilt` that drops the bass by about 3 dB so the left hand does not
  cover the melody. Measured offline on an A4: the energy of harmonics 4 to 10
  halves between the start and the end of the note; a low C keeps 25 % of its
  level at 0.9 s, a high C less than 1 %. On "My first scale", which stacks
  eighth notes over a whole note in the bass, the peak stays at 0.39 without a
  single clipped sample. Budget: one oscillator, one filter and one gain per
  note, plus two short-lived nodes for the hammer.
- **The print stylesheet is a separate Encore entry**, loaded with
  `media="print"`. It cannot pollute the on-screen display.
- **Classic session-backed CSRF tokens**, rather than the "stateless"
  (double-submit cookie) mode of Symfony 7.2+. That one would force the
  JavaScript to take part in every submission, including the editor's `fetch`
  calls. The API reads its token from the `X-CSRF-Token` header.
- **`serverVersion=mariadb-10.11.0` and not `mariadb-10.11`** in the DSN: DBAL 4
  demands a full `major.minor.patch` version number and rejects the short form.
- **`symfony/http-client` is in `require-dev`.** It is only useful to
  `ux:icons:import`, when vendoring an icon. In production the app does not even
  have the means to send an outbound request.
- **The active-staff band is drawn inside the SVG**, not in HTML on top of it:
  that way it follows the split into systems with no position arithmetic. It is
  isolated in a `vf-active-stave` group that printing hides.
- **`window.crocheApp` exposes the Stimulus application.** Handy for inspecting
  the editor from the console when something misbehaves on the iPad.
- **Language in the session, not in the URL.** Addresses stay identical across
  the five languages (French, English, Spanish, Portuguese, German): the iPad
  shortcut keeps working whatever the language. The first visit follows the
  browser preference, then falls back to French. The code, the route names and
  the translation keys stay in English; only the interface is translated — the
  URL paths themselves are French words (`/morceaux`, `/profils`).
- **Note names come from the catalogue.** Do-Ré-Mi in French, C-D-E in English:
  it is the same piano key, but not the same way of reading it. The sharp is a
  pattern rather than a word to append (`'%note% dièse'`, `'%note%is'`), because
  German welds it to the name: Cis, Fis, Ais. And the German B is written H —
  of no consequence here, the app never writes flats.
- **The manifest is a route, not a file in `public/`.** A static file would have
  been simpler, but it freezes the app name into a single language: a
  Portuguese-speaking family would have installed an icon named in French. So
  the manifest is rendered by `ManifestController`, and `name` and `short_name`
  come out of the catalogues like the rest of the interface. The price is a
  quiet trap: a manifest is fetched *without* cookies by default, so without the
  session, so without the chosen language. `crossorigin="use-credentials"` on
  the `<link>` tag is what fixes that, and it is the only reason the attribute
  is there.
- **`standalone` mode, with no service worker.** Added to the home screen,
  Croche opens with no address bar and no tab bar — on the iPad, that is height
  handed back to the piano keyboard. Offline use stays out of scope: it would
  call for a service worker, and autosave hits the API anyway.
  The trap worth knowing: **a web app launched from the icon has its own cookie
  jar**, separate from Safari's. The session from the tab does not follow. So
  the PIN code has to be entered once inside the app, and the session holds
  normally afterwards. This is not a bug, it is iOS.
- **The home screen icons are opaque PNGs**, derived from `public/favicon.svg`
  by `bin/build-icons.sh`. Opaque because iOS composites the icon over black: a
  transparent PNG gives a black icon. And with square corners, because iOS
  applies its own mask — rounding twice leaves a dark border. The PNGs are
  committed: nobody needs `rsvg-convert` to install the project.
- **The catalogues are held by a test.** `TranslationCatalogueTest` compares the
  keys of the five files and checks that every `%placeholder%` survives
  translation: a key added on one side only can no longer slip through.
- **The PHP tests run on SQLite**, not on MariaDB. A contributor has nothing to
  install, and the rule of only ever touching the `croche` database is
  respected. The schema is built from the mapping, the migrations being
  MySQL-specific. Accepted trade-off: a regression specific to MariaDB would
  escape this suite.
- **No dark mode**, and no CSS framework: both would add more surface than
  value here.
- **The guided tour describes itself in the templates**, not in the JavaScript.
  An element annotated with `data-tour-step` joins the walk of its screen, and
  the `tour` controller does nothing but collect what is visible, sort it and
  drive. Adding a button to the editor means adding three attributes next to it
  — not editing a list of steps living somewhere else and drifting out of sync.
  The wording comes from the catalogue like everything else.
- **The tour starts on its own the first time, once per screen** (a
  `croche.tour.<screen>` flag in `localStorage`), and the help button plays it
  again. An eight-year-old will not go looking for a help button; the flag is
  written when the tour opens rather than when it ends, so a child who waves it
  away does not meet it again. `signIn()` in the end-to-end tests writes both
  flags: without that, the overlay would swallow the clicks of the whole suite.

---

## Licences

Croche's **code** is under the [MIT](LICENSE) licence.

Some **embedded assets** fall under other licences, all compatible with an MIT
distribution but carrying obligations of their own:

- **Nunito** (interface) — SIL Open Font License 1.1
- **Bravura** (music glyphs, through VexFlow) — SIL OFL 1.1, with "Bravura" as a
  Reserved Font Name: a modified version must be renamed
- **Academico** (text, through VexFlow) — SIL OFL 1.1
- **Tabler Icons** — MIT
- **Twig** — BSD-3-Clause

The detail — authors, versions, obligations, the OFL text — is in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

No dependency under GPL, AGPL or CC-BY-NC is used, and none must be introduced:
that would make the project impossible to distribute under MIT.
