# Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build for production
RUN npm run build

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Copy package files for production dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm ci --production

# Copy built assets from build stage
COPY --from=build /app/dist ./dist

# Install serve for static file serving
RUN npm install -g serve

EXPOSE 5173

# Serve built app
CMD ["serve", "-s", "dist", "-l", "5173"]
