# syntax=docker/dockerfile:1

# archflux-web image (SERVICES_SPEC §3). Build context: frontend/ only.
# Builds the Vite SPA and serves it with nginx. Endpoints are runtime config
# (/config.json from API_URL/WS_URL); the API proxy is enabled only when
# API_UPSTREAM is set (integrated topology).

# ---- Stage 1: build the SPA -------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Build-time fallback only; /config.json wins at runtime.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json .oxlintrc.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- Stage 2: nginx runtime --------------------------------------------
FROM nginx:alpine AS runtime

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/40-archflux-runtime.sh /docker-entrypoint.d/40-archflux-runtime.sh
# Entrypoint snippets must be executable or nginx ignores them. Defaults keep
# `nginx -t` valid even before the runtime script has run.
RUN chmod 0755 /docker-entrypoint.d/40-archflux-runtime.sh \
  && mkdir -p /etc/nginx/archflux \
  && echo "set \$archflux_csp \"default-src 'self'\";" > /etc/nginx/archflux/runtime.conf \
  && echo "# no API proxy" > /etc/nginx/archflux/api-proxy.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
