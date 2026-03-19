import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { metricsStore } from './metrics.store';
import { blockedIPsStore } from './nestshield.guard';

// ─── Tier limits ──────────────────────────────────────────────────────────────
const TIERS = {
  free: { dailyLimit: 5,   label: 'Free'  },
  pro:  { dailyLimit: 300, label: 'Pro'   },
};

// ─── In-memory state ──────────────────────────────────────────────────────────
const alertCooldowns  = new Map<string, number>();
const COOLDOWN_MS     = 10 * 60 * 1000; // 10 minutes

// Daily counter — resets at midnight
let alertsToday   = 0;
let counterDate   = new Date().toDateString();

function resetDailyCounterIfNeeded() {
  const today = new Date().toDateString();
  if (today !== counterDate) { alertsToday = 0; counterDate = today; }
}

function isOnCooldown(key: string): boolean {
  const last = alertCooldowns.get(key);
  return last ? Date.now() - last < COOLDOWN_MS : false;
}
function setCooldown(key: string) { alertCooldowns.set(key, Date.now()); }

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  // ─── License validation ────────────────────────────────────────────────────
  // Validates the key format: ns_free_XXXX or ns_pro_XXXX
  // In production you'd verify against YOUR database/API
  private getLicenseTier(): 'free' | 'pro' | 'none' {
    const key = process.env.NESTSHIELD_LICENSE_KEY || '';

    if (!key) {
      // No key = free tier with reduced limits
      return 'free';
    }

    if (key.startsWith('ns_pro_')) return 'pro';
    if (key.startsWith('ns_free_')) return 'free';

    this.logger.warn('⚠ Invalid NESTSHIELD_LICENSE_KEY format. Using free tier.');
    return 'free';
  }

  private canSendAlert(): { allowed: boolean; reason?: string } {
    resetDailyCounterIfNeeded();
    const tier  = this.getLicenseTier();
    const limit = TIERS[tier].dailyLimit;

    if (alertsToday >= limit) {
      return {
        allowed: false,
        reason: `Daily limit reached (${alertsToday}/${limit} alerts). Upgrade to Pro for 300 alerts/day.`,
      };
    }
    return { allowed: true };
  }

  // ─── Alert rules ───────────────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkAlerts() {
    if (metricsStore.length === 0) return;

    const now        = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;

    const withTimes = metricsStore.map(e => ({ ...e, t: new Date(e.timestamp).getTime() }));
    const recent    = withTimes.filter(e => e.t > fiveMinAgo);
    if (recent.length === 0) return;

    const total     = recent.length;
    const errors    = recent.filter(e => e.statusCode >= 400).length;
    const errorRate = (errors / total) * 100;

    // Rule 1 — high error rate
    if (errorRate > 5 && !isOnCooldown('error-rate')) {
      setCooldown('error-rate');
      await this.sendAlert({
        level:        'CRITICAL',
        subject:      '🔴 High Error Rate Detected',
        headline:     `API error rate spiked to ${errorRate.toFixed(1)}%`,
        whatHappened: `In the last 5 minutes, ${errors} of ${total} requests returned errors. Threshold is 5%.`,
        failedRoutes: this.getFailedRoutes(recent),
        action:       'Investigate failing endpoints and check your application logs immediately.',
      });
    }

    // Rule 2 — slow API (p95 > 1000ms)
    const durations = recent.map(e => e.duration).sort((a, b) => a - b);
    const p95       = durations[Math.floor(durations.length * 0.95)] || 0;
    if (p95 > 1000 && !isOnCooldown('slow-api')) {
      setCooldown('slow-api');
      await this.sendAlert({
        level:        'WARNING',
        subject:      '🟡 Slow API Response Times',
        headline:     `p95 latency hit ${p95}ms`,
        whatHappened: `95% of requests in the last 5 minutes took longer than ${p95}ms. Threshold is 1000ms.`,
        failedRoutes: this.getSlowRoutes(recent),
        action:       'Check DB queries, external service dependencies, and server resources.',
      });
    }

    // Rule 3 — attack (> 5 IPs blocked)
    if (blockedIPsStore.size > 5 && !isOnCooldown('attack')) {
      setCooldown('attack');
      const ips = Array.from(blockedIPsStore.values())
        .sort((a, b) => b.hits - a.hits).slice(0, 8)
        .map(b => ({ route: b.ip, count: b.hits, status: 429 as any, method: 'IP' }));
      await this.sendAlert({
        level:        'CRITICAL',
        subject:      '🚨 Possible Attack Detected',
        headline:     `${blockedIPsStore.size} IPs rate-limited`,
        whatHappened: `An unusually high number of IPs are being blocked. Possible DDoS, credential stuffing, or scraping.`,
        failedRoutes: ips,
        action:       'Review blocked IPs in your dashboard. Consider adding firewall rules if attack persists.',
      });
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  private getFailedRoutes(events: any[]) {
    const map = new Map<string, {
      count: number; status: number; method: string;
      errorMessages: Set<string>; errorType: string;
      controllers: Set<string>;
    }>();

    events.filter(e => e.statusCode >= 400).forEach(e => {
      const key = `${e.method}||${e.route}`;
      if (!map.has(key)) map.set(key, {
        count: 0, status: e.statusCode, method: e.method,
        errorMessages: new Set(), errorType: e.errorType || 'Error',
        controllers: new Set(),
      });
      const entry = map.get(key)!;
      entry.count++;
      if (e.errorMessage) entry.errorMessages.add(e.errorMessage);
      // Track which controller.handler handled this
      if (e.controllerName && e.handlerName) {
        entry.controllers.add(`${e.controllerName}.${e.handlerName}()`);
      }
    });

    return Array.from(map.entries()).map(([k, v]) => ({
      route:        k.split('||')[1],
      count:        v.count,
      status:       v.status,
      method:       v.method,
      errorType:    v.errorType,
      errorMessage: Array.from(v.errorMessages).slice(0, 3).join(' | ') || null,
      controller:   Array.from(v.controllers).slice(0, 1)[0] || null,
    })).sort((a, b) => b.count - a.count).slice(0, 6);
  }

  private getSlowRoutes(events: any[]) {
    const map = new Map<string, number[]>();
    events.forEach(e => {
      const k = `${e.method}||${e.route}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e.duration);
    });
    return Array.from(map.entries()).map(([k, durations]) => {
      const s = [...durations].sort((a, b) => a - b);
      return {
        route:  k.split('||')[1],
        count:  s[Math.floor(s.length * 0.95)] ?? s[s.length - 1] ?? 0,
        status: 200 as any,
        method: k.split('||')[0],
      };
    }).filter(r => r.count > 500).sort((a, b) => b.count - a.count).slice(0, 6);
  }

  // ─── Core send via Gmail ──────────────────────────────────────────────────
  async sendAlert(data: {
    level:        string;
    subject:      string;
    headline:     string;
    whatHappened: string;
    failedRoutes: Array<{ route: string; count: number; status: number | string; method: string }>;
    action:       string;
  }) {
    const check = this.canSendAlert();
    if (!check.allowed) {
      this.logger.warn(`⚠ Alert blocked — ${check.reason}`);
      return;
    }

    const gmailUser  = process.env.GMAIL_USER;
    const gmailPass  = process.env.GMAIL_PASS;
    const alertEmail = process.env.ALERT_EMAIL;
    const tier       = this.getLicenseTier();

    if (!gmailUser || !gmailPass) {
      this.logger.error('❌ GMAIL_USER or GMAIL_PASS not set in .env');
      return;
    }
    if (!alertEmail) {
      this.logger.error('❌ ALERT_EMAIL not set in .env');
      return;
    }

    let appName = process.env.APP_NAME || '';
    if (!appName) {
      try {
        const pkg = JSON.parse(require('fs').readFileSync(
          require('path').join(process.cwd(), 'package.json'), 'utf8'
        ));
        // Capitalize first letter of package name so it looks professional
        const raw = pkg.name || 'NestShield';
        appName = raw.charAt(0).toUpperCase() + raw.slice(1);
      } catch { appName = 'NestShield'; }
    }

    const dashUrl = process.env.DASHBOARD_URL || 'http://localhost:3000/nestshield/ui';
    const time    = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' });
    const html    = this.buildEmailHtml({ ...data, appName, dashUrl, time, tier });

    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host:   'smtp.gmail.com',
        port:   587,
        secure: false,
        auth:   { user: gmailUser, pass: gmailPass },
      });

      await transporter.sendMail({
        from:    `"NestShield Alerts" <${gmailUser}>`,
        to:      alertEmail,
        subject: `${data.subject} — ${appName}`,
        html,
      });

      alertsToday++;
      const remaining = TIERS[tier].dailyLimit - alertsToday;
      this.logger.log(`✅ Alert sent: "${data.subject}" | ${alertsToday}/${TIERS[tier].dailyLimit} today | ${remaining} remaining`);

    } catch (err) {
      this.logger.error(`❌ Alert failed: ${err.message}`);
    }
  }

  // ─── HTML email template ──────────────────────────────────────────────────

  // ─── HTML email template — Light theme, matches website ──────────────────

  // ─── HTML email template ──────────────────────────────────────────────────
  private buildEmailHtml(data: {
    level: string; subject: string; headline: string;
    whatHappened: string; action: string; appName: string;
    dashUrl: string; time: string; tier: string;
    failedRoutes: Array<{ route: string; count: number; status: number | string; method: string }>;
  }): string {

    // ── Calm color palette ─────────────────────────────────────────────────
    // Header: deep indigo-slate — not black, not aggressive
    // Accent: level-based, muted and readable
    const levelAccent  = data.level === 'CRITICAL' ? '#c0392b'
                       : data.level === 'WARNING'  ? '#b7770d'
                       : '#1a7f5a';
    const levelBg      = data.level === 'CRITICAL' ? '#fff8f8'
                       : data.level === 'WARNING'  ? '#fffdf0'
                       : '#f0fdf8';
    const levelBorder  = data.level === 'CRITICAL' ? '#f5c6c6'
                       : data.level === 'WARNING'  ? '#f5e0a0'
                       : '#a7e8ce';
    const levelDot     = data.level === 'CRITICAL' ? '&#9679;'
                       : data.level === 'WARNING'  ? '&#9679;'
                       : '&#10003;';

    const tierBadge = data.tier === 'pro'
      ? `<span style="display:inline-block;background:#5b54e8;color:#ffffff;font-size:9px;font-weight:700;padding:2px 9px;border-radius:20px;letter-spacing:0.08em;vertical-align:middle;margin-left:10px;font-family:monospace">PRO</span>`
      : `<span style="display:inline-block;background:#e8e8f0;color:#8888aa;font-size:9px;font-weight:700;padding:2px 9px;border-radius:20px;letter-spacing:0.08em;vertical-align:middle;margin-left:10px;font-family:monospace">FREE</span>`;

    const countLabel = (r: any) =>
      r.method === 'IP'          ? `${r.count} hits`
      : data.level === 'WARNING' ? `${r.count}ms p95`
      : `${r.count} errors`;

    // ── Endpoint cards ──────────────────────────────────────────────────────
    const endpointCards = (data.failedRoutes as any[]).slice(0, 5).map(r => {
      const is5xx   = Number(r.status) >= 500;
      const is429   = Number(r.status) === 429;
      const isIP    = r.method === 'IP';
      const accent  = (is5xx || isIP) ? '#c0392b' : (is429 || Number(r.status) >= 400) ? '#b7770d' : '#1a7f5a';
      const cardBg  = (is5xx || isIP) ? '#fdf6f6' : is429 ? '#fdf9ed' : '#f4fcf8';
      const borderC = (is5xx || isIP) ? '#eed8d8' : is429 ? '#eadbb5' : '#bbe8d4';

      const mColor  = r.method === 'GET'    ? { bg:'#eef4ff', c:'#3461c1' }
                    : r.method === 'POST'   ? { bg:'#edfbf3', c:'#1a7f5a' }
                    : r.method === 'PUT'    ? { bg:'#fdf9ed', c:'#b7770d' }
                    : r.method === 'DELETE' ? { bg:'#fdf6f6', c:'#c0392b' }
                    : { bg:'#f3f4f6', c:'#6b7280' };

      return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;background:${cardBg};border:1px solid ${borderC};border-radius:12px;overflow:hidden">
        <tr><td style="padding:16px 20px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:top">
                <span style="display:inline-block;background:${mColor.bg};color:${mColor.c};font-size:10px;font-weight:700;padding:3px 9px;border-radius:5px;font-family:monospace;letter-spacing:0.06em">${r.method}</span>
                <span style="font-family:monospace;font-size:14px;color:#1a1a2e;font-weight:600;margin-left:10px">${r.route}</span>
                ${r.controller ? `<div style="font-family:monospace;font-size:10px;color:#a0a0b8;margin-top:4px;padding-left:2px">${r.controller}</div>` : ''}
              </td>
              <td align="right" style="vertical-align:top;white-space:nowrap;padding-left:12px">
                <span style="font-family:monospace;font-size:12px;font-weight:700;color:${accent}">${countLabel(r)}</span>
                &nbsp;
                <span style="display:inline-block;background:${accent}18;color:${accent};font-family:monospace;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;border:1px solid ${accent}35">${r.status}</span>
              </td>
            </tr>
          </table>
          ${r.errorMessage ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
            <tr><td style="background:#1e1b3a;border-radius:8px;padding:12px 16px">
              <div style="font-family:monospace;font-size:9px;color:#7c75d0;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:6px;font-weight:700">${r.errorType || 'Exception'}</div>
              <div style="font-family:monospace;font-size:12px;color:#ff9999;line-height:1.6;word-break:break-all">${r.errorMessage}</div>
            </td></tr>
          </table>` : ''}
        </td></tr>
      </table>`;
    }).join('');

    // ── Main HTML ───────────────────────────────────────────────────────────
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NestShield Alert</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#eef0f5;font-family:'Inter',system-ui,-apple-system,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f5">
<tr><td align="center" style="padding:40px 16px">

<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(60,60,120,0.10),0 2px 8px rgba(60,60,120,0.06)">

  <!-- ═══ HEADER — calm deep indigo-slate, not harsh black ═══ -->
  <tr><td style="background:linear-gradient(135deg,#1e1b4b 0%,#2d2975 50%,#1a1840 100%);padding:0">
    <!-- Thin gradient accent line at top -->
    <div style="height:3px;background:linear-gradient(90deg,#818cf8,#a78bfa,#c084fc,#f0abfc)"></div>
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:26px 30px 22px">
      <tr>
        <td style="vertical-align:middle">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:14px">
              <!-- Logo: soft indigo square with N -->
              <table cellpadding="0" cellspacing="0" style="width:42px;height:42px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:11px;box-shadow:0 4px 14px rgba(99,102,241,0.45)">
                <tr><td align="center" style="text-align:center;vertical-align:middle;width:42px;height:42px">
                  <span style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:900;color:#ffffff;line-height:1">N</span>
                </td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <div style="font-family:'Inter',system-ui,sans-serif;font-size:19px;font-weight:800;color:#f0f0ff;letter-spacing:-0.4px;line-height:1">NestShield ${tierBadge}</div>
              <div style="font-family:monospace;font-size:9px;color:#6366a1;letter-spacing:0.18em;text-transform:uppercase;margin-top:5px">API Guard &amp; Monitor</div>
            </td>
          </tr></table>
        </td>
        <td align="right" style="vertical-align:middle">
          <span style="background:${levelAccent};color:#ffffff;font-family:'Inter',sans-serif;font-size:10px;font-weight:700;padding:7px 18px;border-radius:20px;letter-spacing:0.1em;white-space:nowrap">${data.level}</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ═══ ALERT BANNER — calm, readable ═══ -->
  <tr><td style="background:${levelBg};border-left:4px solid ${levelAccent};border-right:1px solid ${levelBorder};border-top:1px solid ${levelBorder}">
    <div style="padding:22px 26px">
      <div style="font-family:monospace;font-size:10px;color:${levelAccent};font-weight:600;text-transform:uppercase;letter-spacing:0.16em;margin-bottom:10px">${levelDot}&nbsp;&nbsp;${data.subject}</div>
      <div style="font-family:'Inter',system-ui,sans-serif;font-size:22px;font-weight:800;color:#1a1a2e;line-height:1.3;letter-spacing:-0.4px">${data.headline}</div>
    </div>
  </td></tr>

  <!-- ═══ META STRIP ═══ -->
  <tr><td style="background:#ffffff;border-left:1px solid #e8e8f0;border-right:1px solid #e8e8f0">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:16px 20px;border-right:1px solid #f0f0f8;width:33%">
          <div style="font-family:monospace;font-size:9px;color:#b0b0c8;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:5px">Service</div>
          <div style="font-family:'Inter',sans-serif;font-size:14px;font-weight:700;color:#1a1a2e">${data.appName}</div>
        </td>
        <td style="padding:16px 20px;border-right:1px solid #f0f0f8;width:40%">
          <div style="font-family:monospace;font-size:9px;color:#b0b0c8;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:5px">Detected At</div>
          <div style="font-family:monospace;font-size:11px;font-weight:600;color:#2a2a4a">${data.time}</div>
        </td>
        <td style="padding:16px 20px;width:27%">
          <div style="font-family:monospace;font-size:9px;color:#b0b0c8;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:5px">Environment</div>
          <div style="font-family:monospace;font-size:11px;font-weight:600;color:#2a2a4a">${process.env.NODE_ENV || 'production'}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ═══ BODY ═══ -->
  <tr><td style="background:#ffffff;border:1px solid #e8e8f0;border-top:none;padding:26px 26px 22px">

    <!-- What Happened -->
    <div style="font-family:monospace;font-size:9px;font-weight:700;color:#b0b0c8;text-transform:uppercase;letter-spacing:0.16em;margin-bottom:10px">&#9656; What Happened</div>
    <div style="font-family:'Inter',sans-serif;font-size:14px;color:#4a4a6a;line-height:1.75;background:#f8f8fc;border:1px solid #ebebf5;border-radius:10px;padding:16px 18px;margin-bottom:26px">${data.whatHappened}</div>

    ${endpointCards ? `
    <div style="font-family:monospace;font-size:9px;font-weight:700;color:#b0b0c8;text-transform:uppercase;letter-spacing:0.16em;margin-bottom:12px">&#9656; ${data.level === 'WARNING' ? 'Slow Endpoints' : (data.failedRoutes as any[])[0]?.method === 'IP' ? 'Blocked IPs' : 'Failing Endpoints'}</div>
    ${endpointCards}
    <div style="margin-bottom:26px"></div>
    ` : ''}

    <!-- Recommended Action -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdfaf0;border:1px solid #e8d98a;border-radius:12px;margin-bottom:26px;overflow:hidden">
      <tr>
        <td style="width:4px;background:#c9a227;padding:0"></td>
        <td style="padding:15px 18px">
          <div style="font-family:monospace;font-size:9px;font-weight:700;color:#8a6800;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:6px">&#9888; Recommended Action</div>
          <div style="font-family:'Inter',sans-serif;font-size:13px;color:#6a5000;line-height:1.65">${data.action}</div>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <div style="text-align:center;padding:6px 0 2px">
      <a href="${data.dashUrl}" style="display:inline-block;text-decoration:none;background:linear-gradient(135deg,#5b54e8,#8b5cf6);color:#ffffff;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;padding:15px 44px;border-radius:12px;letter-spacing:0.01em;box-shadow:0 4px 14px rgba(91,84,232,0.35)">Open Dashboard &rarr;</a>
    </div>

  </td></tr>

  <!-- ═══ FOOTER ═══ -->
  <tr><td style="background:#f5f5fa;border:1px solid #e8e8f0;border-top:none;border-radius:0 0 18px 18px;padding:16px 26px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:8px">
            <table cellpadding="0" cellspacing="0" style="width:18px;height:18px;background:#6366f1;border-radius:4px">
              <tr><td align="center" style="text-align:center;vertical-align:middle">
                <span style="font-family:Georgia,serif;font-size:10px;font-weight:900;color:#fff;line-height:18px">N</span>
              </td></tr>
            </table>
          </td>
          <td style="font-family:monospace;font-size:11px;color:#b0b0c8;vertical-align:middle">NestShield &middot; ${data.appName}</td>
        </tr></table>
      </td>
      <td align="right" style="font-family:monospace;font-size:10px;color:#c8c8d8">
        <a href="https://nestshield.dev" style="color:#b0b0c8;text-decoration:none">nestshield.dev</a>
        &nbsp;&middot;&nbsp; cooldown 10 min
      </td>
    </tr></table>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
  }
}
