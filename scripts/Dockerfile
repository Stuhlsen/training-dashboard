FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/Stuhlsen/training-dashboard"
WORKDIR /sync
COPY package*.json ./
RUN npm ci --omit=dev
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
