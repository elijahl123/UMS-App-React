FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS source

WORKDIR /app
COPY . .

FROM source AS server-build

RUN npm run build:server

FROM source AS web-build

ARG VITE_API_BASE_URL=
ARG VITE_FIREBASE_API_KEY=
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_GOOGLE_IOS_CLIENT_ID=
ARG VITE_GOOGLE_IOS_REVERSED_CLIENT_ID=
ARG VITE_GOOGLE_REDIRECT_URI=
ARG VITE_APP_ENV=production
ARG VITE_STAGING_ACCESS_CONTROL_ENABLED=false

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_GOOGLE_IOS_CLIENT_ID=$VITE_GOOGLE_IOS_CLIENT_ID \
    VITE_GOOGLE_IOS_REVERSED_CLIENT_ID=$VITE_GOOGLE_IOS_REVERSED_CLIENT_ID \
    VITE_GOOGLE_REDIRECT_URI=$VITE_GOOGLE_REDIRECT_URI \
    VITE_APP_ENV=$VITE_APP_ENV \
    VITE_STAGING_ACCESS_CONTROL_ENABLED=$VITE_STAGING_ACCESS_CONTROL_ENABLED

RUN npm run build

FROM node:22-bookworm-slim AS api-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

FROM node:22-bookworm-slim AS api

ENV NODE_ENV=production \
    PORT=3001
LABEL org.opencontainers.image.source="https://github.com/elijahl123/UMS-App-React"

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node --from=api-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=server-build /app/dist-server ./dist-server
COPY --chown=node:node migrations ./migrations

USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist-server/index.js"]

FROM nginx:1.28-alpine AS web

LABEL org.opencontainers.image.source="https://github.com/elijahl123/UMS-App-React"
COPY deploy/container-nginx.conf /etc/nginx/nginx.conf
COPY --from=web-build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8080/ || exit 1
