# Deployment Guide

## Local Development
### Prerequisites
- Node.js >= 20
- npm >= 10

### Steps
```bash
cp .env.example .env
npm install
npm start
```

UI endpoints:
- Admin: `http://localhost:3000/admin`
- Client: `http://localhost:3000/client`

## Docker Deployment
### Build and run
```bash
docker compose up --build -d
```

### Stop
```bash
docker compose down
```

### Logs
```bash
docker compose logs -f
```

## Raspberry Pi Notes
- the Docker image uses `node:20-alpine`
- keep memory usage in mind for many connected clients
- prefer wired network for stable classroom demos

## Environment Configuration
Set these values in `.env` or compose environment:
- `PORT`
- `ADMIN_PASSWORD`
- `JOIN_CODE_TTL_MINUTES`
- `HEARTBEAT_TIMEOUT_SECONDS`

## Production Recommendations
- place reverse proxy (Caddy/Nginx/Traefik) in front
- enforce TLS
- use strong `ADMIN_PASSWORD`
- monitor process health and restarts
