import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailerService } from '@nestjs-modules/mailer';
import { metricsStore } from './metrics.store';
import { blockedIPsStore } from './nestshield.guard';

const alertCooldowns = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000;

function isOnCooldown(key: string): boolean {
  const last = alertCooldowns.get(key);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

function setCooldown(key: string) {
  alertCooldowns.set(key, Date.now());
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(private readonly mailer: MailerService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkAlerts() {
    const events = metricsStore;
    if (events.length === 0) return;

    const since = Date.now() - 5 * 60 * 1000;
    const recent = events.filter(
      e => new Date(e.timestamp).getTime() > since
    );
    if (recent.length === 0) return;

    const total = recent.length;
    const errors = recent.filter(e => e.statusCode >= 400).length;
    const errorRate = (errors / total) * 100;

    // Rule 1 — error rate > 5%
    if (errorRate > 5 && !isOnCooldown('error-rate')) {
      setCooldown('error-rate');
      await this.sendAlert({
        subject: '🔴 [NestShield] Error rate spike',
        level: 'CRITICAL',
        message: `Error rate is ${errorRate.toFixed(1)}% — threshold is 5%`,
        details: this.getTopErrors(recent),
      });
    }

    // Rule 2 — slow API p95 > 1000ms
    const durations = recent.map(e => e.duration).sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
    if (p95 > 1000 && !isOnCooldown('slow-api')) {
      setCooldown('slow-api');
      await this.sendAlert({
        subject: '🟡 [NestShield] Slow API detected',
        level: 'WARNING',
        message: `p95 latency is ${p95}ms — threshold is 1000ms`,
        details: 'Check your slowest endpoints in the dashboard.',
      });
    }

    // Rule 3 — API down
    const twoMinsAgo = Date.now() - 2 * 60 * 1000;
    const veryRecent = events.filter(
      e => new Date(e.timestamp).getTime() > twoMinsAgo
    );
    if (
      veryRecent.length === 0 &&
      events.length > 10 &&
      !isOnCooldown('api-down')
    ) {
      setCooldown('api-down');
      await this.sendAlert({
        subject: '🔴 [NestShield] API may be down',
        level: 'CRITICAL',
        message: 'No requests in the last 2 minutes',
        details: 'Check your server immediately.',
      });
    }

    // Rule 4 — attack detected
    if (blockedIPsStore.size > 5 && !isOnCooldown('attack')) {
      setCooldown('attack');
      const ips = Array.from(blockedIPsStore.values())
        .slice(0, 5)
        .map(b => `  → ${b.ip} (${b.hits} hits)`)
        .join('\n');
      await this.sendAlert({
        subject: '🚨 [NestShield] Attack detected',
        level: 'CRITICAL',
        message: `${blockedIPsStore.size} IPs have been rate limited`,
        details: ips,
      });
    }

    // Rule 5 — recovery
    if (
      errorRate < 1 &&
      alertCooldowns.has('error-rate') &&
      !isOnCooldown('recovery')
    ) {
      setCooldown('recovery');
      await this.sendAlert({
        subject: '✅ [NestShield] Service recovered',
        level: 'RECOVERY',
        message: `Error rate is back to ${errorRate.toFixed(1)}% — all clear`,
        details: 'No action needed.',
      });
    }
  }

  private getTopErrors(events: any[]): string {
    const routeErrors = new Map<string, number>();
    events
      .filter(e => e.statusCode >= 400)
      .forEach(e => {
        const key = `${e.method} ${e.route} (${e.statusCode})`;
        routeErrors.set(key, (routeErrors.get(key) || 0) + 1);
      });
    return Array.from(routeErrors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route, count]) => `  → ${route} — ${count} errors`)
      .join('\n');
  }

  async sendAlert(data: {
    subject: string;
    level: string;
    message: string;
    details: string;
  }) {
    const dashboardUrl =
      process.env.DASHBOARD_URL ||
      'http://localhost:3000/nestshield/ui';
    const appName = process.env.APP_NAME || 'my-service';

    try {
      await this.mailer.sendMail({
        to: process.env.ALERT_EMAIL,
        subject: `${data.subject} — ${appName}`,
        text: `
NestShield Alert
================
Service:   ${appName}
Time:      ${new Date().toLocaleString()}
Level:     ${data.level}

${data.message}

${data.details}

Dashboard: ${dashboardUrl}

This alert will not repeat for 10 minutes.
        `.trim(),
      });
      this.logger.log(`✅ Alert sent: ${data.subject}`);
    } catch (err) {
      this.logger.error(`❌ Failed to send alert: ${err.message}`);
    }
  }
}