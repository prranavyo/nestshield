import { Injectable } from '@nestjs/common';
import { metricsStore } from './metrics.store';
import { blockedIPsStore, totalRateLimited } from './nestshield.guard';

// ─── Pure in-memory stats ─────────────────────────────────────────────────────
// No DB queries. All data from metricsStore. Zero lag, zero reconnecting.

@Injectable()
export class MetricsService {

  // No-op: kept for interface compatibility only
  async save(_data: any) {}

  getStatsSync(hours: number = 1): any {
    const since  = Date.now() - hours * 3_600_000;
    const events = metricsStore.filter(e => new Date(e.timestamp).getTime() >= since);
    const total  = events.length;
    const errors = events.filter(e => e.statusCode >= 400).length;
    const avgLat = total > 0 ? Math.round(events.reduce((s, e) => s + e.duration, 0) / total) : 0;

    const routeMap = new Map<string, any[]>();
    for (const e of events) {
      const key = e.method + '||' + e.route;
      if (!routeMap.has(key)) routeMap.set(key, []);
      routeMap.get(key)!.push(e);
    }

    const routes = Array.from(routeMap.entries()).map(([key, group]) => {
      const [method, route] = key.split('||');
      const sorted = [...group].sort((a, b) => a.duration - b.duration);
      return {
        method, route,
        count:      group.length,
        avgMs:      Math.round(group.reduce((s, e) => s + e.duration, 0) / group.length),
        p95Ms:      sorted[Math.floor(sorted.length * 0.95)]?.duration ?? sorted[sorted.length - 1]?.duration ?? 0,
        p99Ms:      sorted[Math.floor(sorted.length * 0.99)]?.duration ?? sorted[sorted.length - 1]?.duration ?? 0,
        errorCount: group.filter(e => e.statusCode >= 400).length,
        lastStatus: group[group.length - 1].statusCode,
      };
    }).sort((a, b) => b.count - a.count);

    const now      = Date.now();
    const buckets  = hours <= 1 ? 12 : hours <= 6 ? 12 : hours <= 24 ? 24 : 28;
    const bucketMs = (hours * 3_600_000) / buckets;
    const times    = events.map(e => new Date(e.timestamp).getTime());

    const hourly = Array.from({ length: buckets }, (_, i) => {
      const start = now - (buckets - i) * bucketMs;
      const d     = new Date(start);
      return {
        label: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        hour:  d.getHours(),
        count: times.filter(t => t >= start && t < start + bucketMs).length,
      };
    });

    return {
      summary: {
        totalRequests: total,
        errorRate:     total > 0 ? ((errors / total) * 100).toFixed(1) : '0.0',
        avgLatency:    avgLat,
        rateLimited:   totalRateLimited,
        blockedIPs:    blockedIPsStore.size,
      },
      routes,
      hourly,
      recent:     [...events].reverse().slice(0, 50),
      blockedIPs: Array.from(blockedIPsStore.values()).sort((a, b) => b.hits - a.hits),
    };
  }

  async getStats(hours: number = 1): Promise<any> {
    return this.getStatsSync(hours);
  }
}
