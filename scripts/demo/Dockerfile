# Fahrplan 31 E6 — Image für den Dienst "demo-seed" im lokalen Demo-Stack
# (docker-compose.demo.yml). NUR lokaler Build, kommt nie in
# publish-images.yml und nie auf apps01 (Q17).
#
# Vorbild scripts/Dockerfile (Sync). Unterschied: Der Generator rechnet mit
# app/src/core/ + app/src/sports/ (PMC, Plan-Generator, validate.js), darum
# liegen beide mit im Image. Die Root-.dockerignore schließt app/ ganz aus —
# dieses Image nutzt deshalb die eigene Allowlist Dockerfile.dockerignore
# daneben (BuildKit nimmt <Dockerfile>.dockerignore vor der Root-Datei).
#
# Layout = Repo-Layout unter /demo: guards.js löst <repo> zu /demo auf, die
# Pfad-Sperre erlaubt also /demo/data-demo — dort hängt das Volume demo_data.
FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/Stuhlsen/training-dashboard"
# tzdata: "heute" des Generators ist das lokale Datum (TZ aus der Compose-Datei)
RUN apk add --no-cache tzdata
WORKDIR /demo
# package.json nur wegen "type": "module" — der Demo-Code braucht keine npm-Pakete
COPY package.json ./
COPY scripts/ ./scripts/
COPY app/src/core/ ./app/src/core/
COPY app/src/sports/ ./app/src/sports/
RUN chmod +x ./scripts/demo/docker-entrypoint.sh
# Volume-Mountpoint vorab mit node-Ownership anlegen (wie /sync/data im Sync-Image)
RUN mkdir -p data-demo && chown node:node data-demo
USER node
ENTRYPOINT ["./scripts/demo/docker-entrypoint.sh"]
