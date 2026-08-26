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

# Vite inlines import.meta.env.VITE_* at build time, so these have to arrive
# here as build args — passing them as runtime env to the nginx stage does
# nothing. Empty is the normal case: nginx.conf proxies /api/, /ws/tunnel,
# /hook/ and /ingress/ to the api service, so the bundle talks to its own
# origin and needs no absolute API URL.
ARG VITE_API_URL=""
ARG VITE_CSP_EXTRA_CONNECT=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CSP_EXTRA_CONNECT=$VITE_CSP_EXTRA_CONNECT

# Build for production
RUN npm run build

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
