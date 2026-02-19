# Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files (build context is project root)
COPY webhook-platform-ui/package*.json ./

# Install dependencies
RUN npm ci

# Copy UI source files
COPY webhook-platform-ui/ .

# Build for production
RUN npm run build

# Runtime stage
FROM nginx:1.25-alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY webhook-platform-ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
