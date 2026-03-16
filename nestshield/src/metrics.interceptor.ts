import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsGateway } from './metrics.gateway';
import { MetricsService } from './metrics.service';
import { blockedIPsStore, totalRateLimited } from './nestshield.guard';
import { metricsStore } from './metrics.store';



function calcStats() {
  const total = metricsStore.length;
  if (total === 0) return null;

  const errors = metricsStore.filter(e => e.statusCode >= 400).length;
  const avgLatency = Math.round(
    metricsStore.reduce((s, e) => s + e.duration, 0) / total,
  );

  // Group by route in memory — zero DB query
  const routeMap = new Map<string, any[]>();
  for (const e of metricsStore) {
    const key = e.method + '||' + e.route;
    if (!routeMap.has(key)) routeMap.set(key, []);
    routeMap.get(key)!.push(e);
  }

  const routes = Array.from(routeMap.entries()).map(([key, group]) => {
    const [method, route] = key.split('||');
    const sorted = [...group].sort((a, b) => a.duration - b.duration);
    const p95idx = Math.floor(sorted.length * 0.95);
    const p99idx = Math.floor(sorted.length * 0.99);
    return {
      method,
      route,
      count: group.length,
      avgMs: Math.round(group.reduce((s, e) => s + e.duration, 0) / group.length),
      p95Ms: sorted[p95idx]?.duration ?? sorted[sorted.length - 1]?.duration ?? 0,
      p99Ms: sorted[p99idx]?.duration ?? sorted[sorted.length - 1]?.duration ?? 0,
      errorCount: group.filter(e => e.statusCode >= 400).length,
      lastStatus: group[group.length - 1].statusCode,
    };
  }).sort((a, b) => b.p95Ms - a.p95Ms);

  // Hourly breakdown
  const hourly = Array.from({ length: 12 }, (_, i) => {
    const hour = new Date();
    hour.setHours(hour.getHours() - (11 - i), 0, 0, 0);
    const next = new Date(hour);
    next.setHours(next.getHours() + 1);
    return {
      hour: hour.getHours(),
      count: metricsStore.filter(e => {
        const t = new Date(e.timestamp);
        return t >= hour && t < next;
      }).length,
    };
  });

  return {
    summary: {
      totalRequests: total,
      errorRate: ((errors / total) * 100).toFixed(1),
      avgLatency,
      rateLimited: totalRateLimited,           
      blockedIPs: blockedIPsStore.size,
    },
    routes,
    hourly,
    recent: metricsStore.slice(-50).reverse(),
    blockedIPs: Array.from(blockedIPsStore.values())  // ← this
    .sort((a, b) => b.hits - a.hits),
  };
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly gateway: MetricsGateway,
    private readonly metricsService: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const method = request.method;
    const route = request.url;
    const startTime = Date.now();

    // Skip nestshield's own routes
    if (route.startsWith('/nestshield')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        const event = {
          method,
          route,
          statusCode,
          duration,
          timestamp: new Date().toISOString(),
        };

        // Save to memory
        metricsStore.push(event);
        if (metricsStore.length > 500) metricsStore.shift();

        // Save to PostgreSQL fire and forget
        this.metricsService.save(event).catch(() => null);

        // Calculate stats from memory and push WITH the WebSocket event
        // Zero DB query — instant
        const stats = calcStats();
        if (stats) {
          this.gateway.sendUpdate(stats);
        }

        console.log(`[NestShield] ${method} ${route} ${statusCode} ${duration}ms`);
      }),
    );
  }
}