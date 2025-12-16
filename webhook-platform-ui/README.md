# Webhook Platform UI

React-based frontend for the Webhook Platform.

## Tech Stack

- React 18
- TypeScript
- Vite
- React Router
- Axios

## Development

### Local Development (without Docker)

```bash
cd webhook-platform-ui
npm install
npm run dev
```

Access at: http://localhost:5173

### With Docker Compose

From the repo root:

```bash
docker compose up ui
```

Or start all services:

```bash
docker compose up
```

## Features Implemented (Iteration 1)

- ✅ User Registration
- ✅ User Login
- ✅ JWT Authentication (in-memory token)
- ✅ Projects List
- ✅ Create Project

## Security

- JWT tokens stored in React state (memory only)
- User logged out on page refresh (by design for MVP)
- Authorization header sent with all authenticated requests

## API Integration

Backend URL configured via:
- Local dev: `http://localhost:8080` (default)
- Docker: `http://api:8080` (via VITE_API_URL env var)

All API calls use Bearer token authentication except login/register.
