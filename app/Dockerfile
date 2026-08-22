# Stufe 1: Bauen
FROM node:22-alpine AS build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
# Build-Context ist nur ./app (kein .git) — vite.config.ts kann die Version
# hier nicht per "git describe" ermitteln, ARG/ENV liefert sie stattdessen
# (aus dem Tag-Namen, s. publish-images.yml). Issue #6.
ARG VITE_APP_VERSION
ENV VITE_APP_VERSION=$VITE_APP_VERSION
RUN npm run build:docker

# Stufe 2: Ausliefern
FROM nginx:1.31-alpine
LABEL org.opencontainers.image.source="https://github.com/Stuhlsen/training-dashboard"
RUN addgroup -g 1001 appgroup && adduser -D -u 1001 -G appgroup appuser
COPY --from=build /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-write-config.sh
RUN chmod +x /docker-entrypoint.d/40-write-config.sh \
    && chown -R appuser:appgroup /usr/share/nginx/html /var/cache/nginx /var/run \
    && touch /var/run/nginx.pid \
    && chown appuser:appgroup /var/run/nginx.pid
USER appuser
EXPOSE 8080
