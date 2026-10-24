# syntax=docker/dockerfile:1.7

# One system image for every role (app, and the one-off commands run by the release script). It holds PHP, its
# extensions and the tools, never the code: the code is the git checkout of the server, mounted over /app, so a release
# is a git pull and this image is only rebuilt, on the server itself by deploy/server/croche-deploy, when this file or
# docker/ change.
# The PHP patch is pinned so that a security release is a commit: 8.5.12 is the version running on rossem.
FROM dunglas/frankenphp:1-php8.5.12-trixie

ENV TZ=Indian/Mayotte \
    APP_ENV=prod \
    APP_DEBUG=0 \
    OPCACHE_VALIDATE_TIMESTAMPS=0 \
    XDG_CONFIG_HOME=/config \
    XDG_DATA_HOME=/data \
    COMPOSER_HOME=/tmp/composer

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tzdata \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ctype, iconv, json and mbstring are compiled into the base image; Croche needs intl (translations, twig/intl-extra)
# and pdo_mysql on top.
RUN install-php-extensions intl opcache pdo_mysql

COPY docker/php/croche.ini $PHP_INI_DIR/conf.d/zz-croche.ini
COPY docker/frankenphp/Caddyfile /etc/frankenphp/Caddyfile
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# The base image probes Caddy's admin API, which docker/frankenphp/Caddyfile turns off: left in place, every container
# would read as unhealthy. The app service checks /healthz instead (deploy/production/compose.yaml).
HEALTHCHECK NONE

CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile", "--adapter", "caddyfile"]
