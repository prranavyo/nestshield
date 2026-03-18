import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Metric } from './metric.entity';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(Metric)
    private readonly repo: Repository<Metric>,
  ) {}

  async save(data: {
    method: string;
    route: string;
    statusCode: number;
    duration: number;
  }) {
    const metric = this.repo.create(data);
    await this.repo.save(metric);
  }

  async getStats(hours: number = 1): Promise<any> {
    // PERFORMANCE FIX: fetch only what we need — no double filtering
    const since = new Date();
    since.setTime(since.getTime() - hours * 3600000);

    const events = await this.repo.find({
      where: { timestamp: MoreThanOrEqual(since) },
      order: { timestamp: 'DESC' },
      take: 1000,
    });

    const total = events.length;
    const errors = events.filter(e => e.statusCode >= 400).length;
    const avgLatency = total > 0
      ? Math.round(events.reduce((s, e) => s + e.duration, 0) / total)
      : 0;

    const routeMap = new Map<string, any[]>();
    for (const e of events) {
      const key = `${e.method}||${e.route}`;
      if (!routeMap.has(key)) routeMap.set(key, []);
      routeMap.get(key)!.push(e);
    }

    const routes = Array.from(routeMap.entries()).map(([key, group]) => {
      const [method, route] = key.split('||');
      const sorted = [...group].sort((a, b) => a.duration - b.duration);
      const p95idx = Math.floor(sorted.length * 0.95);
      const p99idx = Math.floor(sorted.length * 0.99);
      return {
        method, route,
        count: group.length,
        avgMs: Math.round(group.reduce((s, e) => s + e.duration, 0) / group.length),
        p95Ms: sorted[p95idx]?.duration ?? sorted[sorted.length - 1]?.duration ?? 0,
        p99Ms: sorted[p99idx]?.duration ?? sorted[sorted.length - 1]?.duration ?? 0,
        errorCount: group.filter(e => e.statusCode >= 400).length,
        lastStatus: group[group.length - 1].statusCode,
      };
    }).sort((a, b) => b.p95Ms - a.p95Ms);

    // PERFORMANCE FIX: precompute bucket boundaries once
    const now = Date.now();
    const buckets = hours <= 1 ? 12 : hours <= 6 ? 12 : hours <= 24 ? 24 : 28;
    const bucketSize = (hours * 60) / buckets;

    // Precompute all event timestamps once
    const eventTimes = events.map(e => new Date(e.timestamp).getTime());

    const hourly = Array.from({ length: buckets }, (_, i) => {
      const bucketStart = now - (buckets - i) * bucketSize * 60000;
      const bucketEnd = bucketStart + bucketSize * 60000;
      const bucketDate = new Date(bucketStart);
      return {
        hour: bucketDate.getHours(),
        label: bucketDate.toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit',
        }),
        count: eventTimes.filter(t => t >= bucketStart && t < bucketEnd).length,
      };
    });

    return {
      summary: {
        totalRequests: total,
        errorRate: total > 0 ? ((errors / total) * 100).toFixed(1) : '0.0',
        avgLatency,
      },
      routes,
      hourly,
      recent: events.slice(0, 50),
    };
  }
}
