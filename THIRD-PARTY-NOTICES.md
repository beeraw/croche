# Third-party notices

Croche itself is distributed under the MIT License (see [LICENSE](LICENSE)).
It embeds or depends on the third-party works listed below. Each remains under
its own licence, and those licences are reproduced or linked here as required.

Nothing in this list is loaded from a remote server at runtime: every asset is
bundled or vendored inside the repository.

---

## Fonts embedded in the repository

### Nunito

- **Files**: `assets/fonts/nunito-latin.woff2`, `assets/fonts/nunito-latin-ext.woff2`
- **Author**: Vernon Adams, Cyreal, Jacques Le Bailly
- **Licence**: SIL Open Font License 1.1
- **Upstream**: <https://github.com/googlefonts/nunito>
- **Licence text**: [licenses/OFL-1.1.txt](licenses/OFL-1.1.txt)

Nunito is distributed under the OFL. The font files shipped here are the
unmodified Google Fonts `woff2` subsets (latin and latin-extended). The OFL
requires that this notice and the licence text travel with the font files, and
forbids selling the fonts on their own. Nunito declares no Reserved Font Name,
so a derivative may keep the name — but if you modify the files, say so.

### Bravura (music notation glyphs)

- **Distributed inside**: the `vexflow` npm package, as a base64 `data:` URI in
  `node_modules/vexflow/build/*/src/fonts/bravura.js`, which webpack bundles
  into `public/build/`.
- **Author**: Steinberg Media Technologies GmbH (Daniel Spreadbury)
- **Licence**: SIL Open Font License 1.1
- **Reserved Font Name**: **Bravura**
- **Upstream**: <https://github.com/steinbergmedia/bravura>
- **Licence text**: [licenses/OFL-1.1.txt](licenses/OFL-1.1.txt)

"Bravura" is a Reserved Font Name. The font may be redistributed and embedded
freely, but a **modified** version must be renamed: do not ship an altered
Bravura under the name Bravura.

### Academico (text font used by VexFlow for lyrics and annotations)

- **Distributed inside**: the `vexflow` npm package, same mechanism as Bravura.
- **Author**: Steinberg Media Technologies GmbH, after Century Schoolbook
- **Licence**: SIL Open Font License 1.1
- **Upstream**: <https://github.com/steinbergmedia/academico>
- **Licence text**: [licenses/OFL-1.1.txt](licenses/OFL-1.1.txt)

---

## Icons vendored in the repository

### Tabler Icons

- **Files**: `assets/icons/tabler/*.svg` (only the icons the app actually uses)
- **Author**: Paweł Kuna and contributors
- **Licence**: MIT
- **Upstream**: <https://github.com/tabler/tabler-icons>

Vendored with `bin/console ux:icons:import tabler:<name>`. On-demand fetching
from the Iconify API is disabled in `config/packages/ux_icons.yaml`, and
`symfony/http-client` — the transport the import command needs — is a
development-only dependency, so a production install cannot fetch an icon even
by accident.

---

## JavaScript bundled into the browser

| Package | Version | Licence | Author |
| --- | --- | --- | --- |
| [vexflow](https://github.com/vexflow/vexflow) | 5.0.0 | MIT | Mohit Muthanna Cheppudira and VexFlow contributors |
| [@hotwired/stimulus](https://github.com/hotwired/stimulus) | 3.2.2 | MIT | Basecamp, LLC |
| [@symfony/stimulus-bridge](https://github.com/symfony/stimulus-bridge) | 4.0.1 | MIT | Fabien Potencier / Symfony contributors |
| [core-js](https://github.com/zloirock/core-js) | 3.49.0 | MIT | Denis Pushkarev |
| [driver.js](https://github.com/kamranahmedse/driver.js) | 1.8.0 | MIT | Kamran Ahmed |
| [regenerator-runtime](https://github.com/facebook/regenerator) | 0.14.1 | MIT | Facebook, Inc. |

Build-time-only tooling (`@symfony/webpack-encore`, `webpack`, `sass`, Babel and
their transitive dependencies) is MIT-licensed and never reaches the browser.

## Test and quality tooling

Development-only, never shipped and never loaded by the application.

| Package | Licence | Note |
| --- | --- | --- |
| [@playwright/test](https://github.com/microsoft/playwright) | Apache-2.0 | End-to-end tests. Apache-2.0 is compatible with redistributing this project under MIT; it is a dev dependency and no Playwright code is bundled. |
| [phpunit/phpunit](https://github.com/sebastianbergmann/phpunit) | BSD-3-Clause | PHP test suite. |
| [friendsofphp/php-cs-fixer](https://github.com/PHP-CS-Fixer/PHP-CS-Fixer) | MIT | Coding style. |
| [phpstan/phpstan](https://github.com/phpstan/phpstan) + [phpstan-doctrine](https://github.com/phpstan/phpstan-doctrine) | MIT | Static analysis. |
| [rector/rector](https://github.com/rectorphp/rector) | MIT | Automated modernisation. |
| [captainhook/captainhook](https://github.com/captainhookphp/captainhook) | MIT | Git hooks. |
| [eslint](https://github.com/eslint/eslint) + [@eslint/js](https://github.com/eslint/eslint) | MIT | JavaScript lint. |
| [stylelint](https://github.com/stylelint/stylelint) + [stylelint-config-standard-scss](https://github.com/stylelint-scss/stylelint-config-standard-scss) | MIT | SCSS lint. |

`npx playwright install` downloads browser builds into a cache outside the
repository. Those builds carry their own licences (Chromium: BSD-3-Clause and
others; Firefox: MPL-2.0; WebKit: LGPL/BSD) and are not redistributed here.

---

## PHP dependencies

All production Composer dependencies are MIT-licensed, with one exception:

| Package | Licence | Author |
| --- | --- | --- |
| [twig/twig](https://github.com/twigphp/Twig) | BSD-3-Clause | Fabien Potencier and Twig contributors |

The remaining production packages — Symfony components and bundles, Doctrine
ORM/DBAL/Migrations, Monolog, the PSR interfaces, and their transitive
dependencies — are all MIT.

Reproduce the audit at any time with:

```bash
composer licenses --no-dev
```

---

## Audio

The playback engine is hand-written Web Audio synthesis
(`assets/js/audio/AudioEngine.js`). No sample library, soundfont, or third-party
audio asset is used, so there is nothing extra to license.

---

## Adding a dependency

Before adding anything, check its licence. GPL, AGPL, and CC-BY-NC works are
incompatible with shipping this project under MIT and must not be introduced.
When you do add a dependency that reaches the browser or the repository, add a
row to the tables above.
