# 🛡️ NestShield
 
> Real-time API monitoring, rate limiting & email alerts for NestJS — **zero database, zero infrastructure.**
 
[![npm version](https://img.shields.io/npm/v/nestshield)](https://www.npmjs.com/package/nestshield)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NestJS](https://img.shields.io/badge/NestJS-v10%2Fv11-red)](https://nestjs.com)
 
Add NestShield to your NestJS app and you instantly get:
 
- 📊 A **live dashboard** at `/nestshield/ui` showing all your API metrics
- 🔐 A **login page** to keep the dashboard private
- 🚦 **Rate limiting** to protect your API from abuse
- 📧 **Email alerts** when your API has high errors, slow responses, or a DDoS attempt
 
---
 
## Step 1 — Install
 
```bash
npm install nestshield
```
 
Also install these peer dependencies if you haven't already:
 
```bash
npm install @nestjs/throttler @nestjs/schedule @nestjs/websockets @nestjs/platform-socket.io
```
 
---
 
## Step 2 — Generate Your Secret Key
 
Your secret key protects the dashboard. Anyone without it can't log in.
 
Run this command in your terminal to generate one:
 
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
 
You'll get something like:
 
```
a3f8c21e7b904d56f1023ae8dc5b76321047fae9c830d1247b5e609f3a218bc4
```
 
Copy it and add it to your `.env` file:
 
```env
# .env
NESTSHIELD_SECRET=a3f8c21e7b904d56f1023ae8dc5b76321047fae9c830d1247b5e609f3a218bc4
```
 
> ⚠️ Keep this secret safe. Don't commit it to Git. Anyone with this key can access your dashboard.
 
---
 
## Step 3 — Add to Your App
 
Open your `app.module.ts` and import `NestShieldModule`:
 
```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { NestShieldModule } from 'nestshield';
 
@Module({
  imports: [
    NestShieldModule.forRoot({
      dashboardSecret: process.env.NESTSHIELD_SECRET,
    }),
  ],
})
export class AppModule {}
```
 
That's it! Start your app and go to:
 
```
http://localhost:3000/nestshield/ui
```
 
You'll see a login page. Enter your secret key to access the dashboard.
 
---
 
## Step 4 — Enable Email Alerts (Optional)
 
Want to get an email when something goes wrong? Add your email to the config:
 
```typescript
NestShieldModule.forRoot({
  dashboardSecret: process.env.NESTSHIELD_SECRET,
 
  alerts: {
    email: 'you@yourcompany.com', // 👈 alerts are sent here
  },
})
```
 
NestShield will automatically email you when:
 
| Situation | Alert Type |
|---|---|
| Error rate goes above 5% in last 5 minutes | 🔴 CRITICAL |
| p95 response time goes above 1000ms | 🟡 WARNING |
| More than 5 IPs are rate-limited at once (possible DDoS) | 🔴 CRITICAL |
 
> You don't need to set up any SMTP or email service. NestShield sends emails from its own account directly to you.
 
---
 
## Step 5 — Customize (Optional)
 
You can tweak rate limiting and alert thresholds:
 
```typescript
NestShieldModule.forRoot({
  dashboardSecret: process.env.NESTSHIELD_SECRET,
 
  // Rate limiting — how many requests each IP can make
  throttle: {
    ttl:   60_000, // time window = 1 minute (in ms)
    limit: 100,    // max 100 requests per IP per minute
  },
 
  // Email alerts — when to send them
  alerts: {
    email:              'you@yourcompany.com',
    errorRateThreshold: 5,       // alert if errors go above 5%
    latencyThreshold:   1000,    // alert if p95 latency goes above 1000ms
    cooldownMs:         600_000, // don't send the same alert more than once every 10 min
  },
})
```
 
---
 
## Dashboard Routes
 
Once your app is running, these routes are available:
 
| URL | What it does |
|---|---|
| `/nestshield/ui` | 📊 Live metrics dashboard |
| `/nestshield/auth/login` | 🔐 Login page |
| `/nestshield/auth/logout` | 🚪 Log out and clear session |
| `/nestshield/stats?hours=1` | 📄 Raw JSON stats (for last N hours) |
 
---
 
## Environment Variables
 
| Variable | What it's for |
|---|---|
| `NESTSHIELD_SECRET` | Your dashboard secret key |
| `APP_NAME` | Your app's name shown in alert emails (auto-detected from `package.json` if not set) |
| `DASHBOARD_URL` | Link shown in alert emails. Default: `http://localhost:3000/nestshield/ui` |
| `NODE_ENV` | Set to `production` to enable HTTPS-only cookies |
 
A typical `.env` for production:
 
```env
NESTSHIELD_SECRET=your-generated-secret-here
APP_NAME=My API
DASHBOARD_URL=https://api.myapp.com/nestshield/ui
NODE_ENV=production
```
 
---
 
## How the Login Works
 
When you visit `/nestshield/ui` without being logged in, NestShield redirects you to `/nestshield/auth/login`. You enter your secret key, and NestShield gives you a **session cookie** that lasts 8 hours. After 8 hours, you'll need to log in again.
 
The session is stored in a secure cookie:
- **JavaScript can't read it** (protected from XSS attacks)
- **Cross-site requests can't use it** (protected from CSRF attacks)
- **HTTPS-only in production** (set `NODE_ENV=production`)
 
---
 
## Full Example `.env`
 
```env
NESTSHIELD_SECRET=a3f8c21e7b904d56f1023ae8dc5b76321047fae9c830d1247b5e609f3a218bc4
APP_NAME=My Awesome API
DASHBOARD_URL=https://api.myapp.com/nestshield/ui
NODE_ENV=production
```
 
---
 
## Requirements
 
- Node.js `>= 18`
- NestJS `v10` or `v11`
 
---
 
## Links
 
- 🌐 Homepage: [nestshield.dev](https://nestshield.dev) Email :- pranav.d.karanam@gmail.com
- 🐛 Issues: [github.com/prranavyo/nestshield/issues](https://github.com/prranavyo/nestshield/issues)
- 📦 npm: [npmjs.com/package/nestshield](https://www.npmjs.com/package/nestshield)
 
---
 
MIT License © [Pranav Deekshith](mailto:pranav.d.karanam@gmail.com)
