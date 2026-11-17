FROM --platform=$BUILDPLATFORM node:26.13.1-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:26.13.1-alpine3.24
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION
WORKDIR /app
COPY --from=build --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=build --chown=1000:1000 /app/dist ./dist
COPY --chown=1000:1000 package.json ./
USER 1000
EXPOSE 3000 9100
CMD ["node", "dist/main.js"]
