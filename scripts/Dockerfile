FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/Stuhlsen/training-dashboard"
WORKDIR /sync
COPY package*.json ./
RUN npm ci --omit=dev
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh
# Least Privilege wie beim Frontend-Image (dort appuser/1001): dieser
# Container haelt die API-Zugangsdaten (intervals.icu, Notion, Supabase),
# root noetig ist dafuer nicht. /sync/data vorab mit node-Ownership
# anlegen - ein Named Volume uebernimmt die Rechte des Image-Pfads beim
# ersten Start, sonst gehoert der Mountpoint root und der Sync-Lauf
# scheitert am Schreiben.
RUN mkdir -p data && chown node:node data
USER node
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
