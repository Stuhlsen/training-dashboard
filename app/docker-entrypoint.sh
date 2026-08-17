#!/bin/sh
set -e

# Fail fast statt leise leeres config.json zu schreiben: sonst faellt die App
# unbemerkt auf die hart eingetragene dev-Hostname-Tabelle zurueck (config.ts
# verwirft leere Werte), und ein fehlendes .env sieht dann aus wie ein
# funktionierender Container.
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "docker-entrypoint: SUPABASE_URL/SUPABASE_ANON_KEY nicht gesetzt — .env pruefen" >&2
  exit 1
fi

# RUNTIME_ENV bewusst ohne Shell-seitigen Default: der einzige Default
# ("fehlt env -> dev") lebt in config.ts::resolveEntry(), nicht hier UND dort.
cat > /usr/share/nginx/html/config.json <<EOF
{
  "supabaseUrl": "${SUPABASE_URL}",
  "supabaseAnonKey": "${SUPABASE_ANON_KEY}",
  "env": "${RUNTIME_ENV}"
}
EOF
