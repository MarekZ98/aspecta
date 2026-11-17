FROM --platform=$BUILDPLATFORM node:26.13.1-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
# The upstream image lags behind Alpine security fixes (e.g. CVE-2026-111497 in brotli-libs),
# so apply them here to keep the Trivy gate green without ignoring findings.
USER root
RUN apk upgrade --no-cache
USER 101
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
