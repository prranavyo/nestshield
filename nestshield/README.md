# ⚡ NestShield

Real-time API monitoring dashboard for any backend.
Zero config — one import, every route is monitored instantly.

## What it does
- Captures every API request automatically via NestJS interceptor
- Real-time dashboard at `/nestshield/ui` with live WebSocket updates
- Tracks method, route, status code, latency, error rate
- Saves everything permanently to PostgreSQL
- Works as proxy for any language — Node, Python, Java, PHP, Go, Rust

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Create PostgreSQL database
```bash
psql -U postgres -c "CREATE DATABASE nestshield;"
```

### 3. Configure your database password
Open `.env` and update:
```
DB_PASSWORD=your_actual_password
```

### 4. Start the server
```bash
npm run start:dev
```

### 5. Open the dashboard
```
http://localhost:3000/nestshield/ui
```

### 6. Generate test data
Hit any of these routes a few times:
```
http://localhost:3000
http://localhost:3000/api/users
http://localhost:3000/api/products
http://localhost:3000/health
```

Then watch the dashboard update in real time!

## Dashboard features
- Total requests, avg latency, error rate, unique routes
- Request volume bar chart (last 12 hours)
- All endpoints sorted by p95 latency
- Per-route: count, avg, p95, p99, error count, error %, health status
- Live request log (most recent 15)
- Status code breakdown (2xx, 3xx, 4xx, 5xx)
- Top routes by traffic
- Smart alerts (auto-detects slow routes and errors)

## Tech Stack
- NestJS + TypeScript
- PostgreSQL + TypeORM
- WebSockets (Socket.io)
- Vanilla HTML/CSS/JS dashboard

## Built by Pranav
