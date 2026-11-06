#!/bin/sh
set -e

# Em plataformas que montam o volume como root, ajusta a dona da pasta
# e depois executa o app com o usuário sem privilégios.
if [ "$(id -u)" = "0" ]; then
  DESTINO="${DATA_DIR:-/data}"
  mkdir -p "$DESTINO"
  chown -R node:node "$DESTINO" || true
  exec su-exec node "$@"
fi

exec "$@"
