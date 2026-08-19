# Stufe 1: Bauen
FROM node:22-alpine AS build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:docker

# Stufe 2: Ausliefern
FROM nginx:alpine
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
