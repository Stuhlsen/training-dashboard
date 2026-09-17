FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/Stuhlsen/training-dashboard"
WORKDIR /admin-api
COPY package.json server.js auth.js invite.js athletes.js ./
# Least Privilege wie scripts/Dockerfile (dort node:node): dieser Container
# haelt spaeter den SUPABASE_SERVICE_ROLE_KEY, root ist dafuer nicht noetig.
USER node
CMD ["node", "server.js"]
