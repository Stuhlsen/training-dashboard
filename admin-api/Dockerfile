# Build-Kontext = Repo-Wurzel (Fahrplan 25 S1a): das Image enthaelt neben
# admin-api/* gezielt die Rezept-Ableitung aus scripts/lib — dieselben Dateien
# wie das Seed-Skript, keine Kopie im Repo. Bauen:
#   docker build -f admin-api/Dockerfile .
FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/Stuhlsen/training-dashboard"
WORKDIR /srv/admin-api
COPY admin-api/package.json admin-api/server.js admin-api/auth.js admin-api/invite.js admin-api/users.js admin-api/recipes.js ./
# Relativer Pfad ../scripts/lib wie im Repo. Die ESM-Module brauchen ein
# package.json mit "type": "module", sonst liest Node sie als CommonJS.
COPY scripts/lib/recipe-nutrition.js scripts/lib/validate-recipe.js scripts/lib/ingredient-nutrition.json /srv/scripts/lib/
COPY scripts/lib/core/nutrition-taxonomy.js /srv/scripts/lib/core/
RUN echo '{"type":"module"}' > /srv/scripts/package.json
# Least Privilege wie scripts/Dockerfile (dort node:node): dieser Container
# haelt spaeter den SUPABASE_SERVICE_ROLE_KEY, root ist dafuer nicht noetig.
USER node
CMD ["node", "server.js"]
