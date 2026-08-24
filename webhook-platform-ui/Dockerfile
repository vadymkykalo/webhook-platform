# Build stage
# Node:18-alpine went EOL April 2025. 22-alpine is the current
# Maintenance LTS line (actively rebuilt/patched as of 2026-08).
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files (build context is project root)
COPY webhook-platform-ui/package*.json ./

# Install dependencies
RUN npm ci

# Copy UI source files
COPY webhook-platform-ui/ .

# Chromium for the prerender step. Alpine's package rather than a Puppeteer download:
# puppeteer-core ships no browser, and the musl builds Puppeteer fetches do not run here.
# It lives in the build stage only — the runtime image below is nginx and carries none of it.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Build, then render the public pages to static HTML. Without the second step nginx serves
# `<div id="root"></div>` for every URL, and the titles, canonicals and sitemap all point at
# pages whose body is empty until React mounts.
RUN npm run build && npm run prerender

# Runtime stage
# Bumped from the 1.25 stable branch (past EOL) to the current 1.30
# stable branch.
FROM nginx:1.30-alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY webhook-platform-ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
