# 🛡️ NestShield

**Real-time API monitoring for NestJS. No database. No extra setup. Just install and go.**

[![npm version](https://img.shields.io/npm/v/nestshield.svg)](https://www.npmjs.com/package/nestshield)
[![npm downloads](https://img.shields.io/npm/dm/nestshield.svg)](https://www.npmjs.com/package/nestshield)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NestJS](https://img.shields.io/badge/NestJS-v11-red.svg)](https://nestjs.com)

**[Live Demo →](https://nestshield-production.up.railway.app/nestshield/ui)**

---

## What does it do?

Once installed, NestShield automatically:

- 📊 Shows a **live dashboard** at `/nestshield/ui`
- 🚦 **Rate limits** requests per IP
- 🔒 **Blocks IPs** that exceed the rate limit
- 📧 **Sends you an email** when something goes wrong

No Redis. No database. No Prometheus. No Grafana. Nothing extra.

---

## Installation

```bash
npm install nestshield
```

---

## Setup — 3 steps

### Step 1 — Add to your AppModule

Open your `app.module.ts` and add NestShield:

```typescript
import { Module } from '@nestjs/common';
import { NestShieldModule } from 'nestshield';

@Module({
  imports: [
    NestShieldModule.forRoot({
      alerts: {
        email: 'you@youremail.com', // ← your email, alerts will be sent here
      },
    }),
  ],
})
export class AppModule {}
```

That's the minimum config. Just your email address.

### Step 2 — Start your server

```bash
npm run start:dev
```

### Step 3 — Open the dashboard

```
http://localhost:3000/nestshield/ui
```

You're done. ✅

---

## What you'll see on startup

```
✅ NestShield alerts ready → sending to you@youremail.com
🕐 NestShield alert checker started (every 30s)
```

This means everything is working correctly.

---

## Email Alerts

NestShield monitors your API every 30 seconds and sends you an email when:

| What happened | When it triggers |
|---|---|
| 🔴 High error rate | More than 5% of requests are failing |
| 🟡 Slow responses  | p95 response time is above 1000ms |
| 🚨 Possible attack | More than 5 IPs have been blocked |

**You don't need to set up any email account.** NestShield sends alerts from its own email directly to your inbox.

> 💡 Check your **spam folder** the first time — some email clients flag new senders.

---

## Full Configuration

All options are optional except `email`:

```typescript
NestShieldModule.forRoot({

  // Rate limiting settings
  throttle: {
    ttl:   60000,  // time window in milliseconds (default: 60000 = 1 minute)
    limit: 100,    // max requests per IP per window (default: 100)
  },

  // Alert settings
  alerts: {
    email: 'you@youremail.com',  // required — where to send alerts

    errorRateThreshold: 5,       // alert when error % goes above this (default: 5)
    latencyThreshold:   1000,    // alert when p95 ms goes above this (default: 1000)
    cooldownMs:         600000,  // wait this long before sending same alert again
                                 // default: 600000 = 10 minutes
  },

})
```

---

## Dashboard Overview

Visit `http://localhost:3000/nestshield/ui` to see:

| Section                  | What it shows |
|---|---|
| **KPI Cards**            | Total requests, error rate, avg latency, blocked IPs |
| **Request Volume**       | Chart of traffic over time |
| **All Endpoints**        | Per-route stats — requests, latency, errors, health |
| **Live Log**             | Every request in real time |
| **API Health Score**     | 0–100 score based on errors + latency + availability |
| **Alerts**               | Active issues with your API |
| **Blocked IPs**          | IPs currently rate-limited |

---

## Built-in API Endpoints

| Endpoint | What it returns |
|---|---|
| `GET /nestshield/ui` | The live dashboard |

---

## Important Notes

**Metrics reset on restart** — Everything is stored in memory, so metrics clear when your server restarts. This is intentional — it keeps NestShield zero-infrastructure. If you want long-term history, call `/nestshield/stats` periodically and save the data yourself.

**Multiple instances** — If you run multiple server instances (e.g. horizontal scaling), each instance tracks its own metrics independently.

---

## Comparison

| | NestShield | Datadog | Prometheus + Grafana |
|---|---|---|---|
| Setup time | 2 minutes | Hours | Hours |
| Extra infrastructure | None | Cloud account | Docker + servers |
| Cost | Free | $$$ | Free but complex |
| NestJS native | ✅ | ❌ | ❌ |
| Email alerts | ✅ | ✅ | ✅ |
| Rate limiting | ✅ | ❌ | ❌ |
| IP blocking | ✅ | ❌ | ❌ |

---



## Contributing

```bash
git clone https://github.com/prranavyo/nestshield.git
cd nestshield
npm install
npm run start:dev
```

Please open an issue before submitting a PR.

---

## License

MIT © [Pranav Karanam](mailto:pranav.d.karanam@gmail.com)

---

<p align="center">
  Built for the NestJS community
  <br/>
  <a href="https://nestshield-production.up.railway.app/nestshield/ui">Live Demo</a>
</p>