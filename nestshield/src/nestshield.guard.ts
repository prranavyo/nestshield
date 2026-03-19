import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { metricsStore } from './metrics.store';

export interface BlockedIP {
  ip: string;
  hits: number;
  firstSeen: string;
  lastSeen: string;
}

export const blockedIPsStore: Map<string, BlockedIP> = new Map();
export let totalRateLimited = 0;

@Injectable()
export class NestShieldGuard extends ThrottlerGuard {

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const route = request.url || '';
    if (route.startsWith('/nestshield')) {
      return true;
    }
    return false;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest();
    const ip =
      request.headers['x-forwarded-for'] ||
      request.ip ||
      'unknown';

    const now = new Date().toISOString();

    if (blockedIPsStore.has(ip)) {
      const existing = blockedIPsStore.get(ip)!;
      existing.hits++;
      existing.lastSeen = now;
    } else {
      blockedIPsStore.set(ip, {
        ip,
        hits: 1,
        firstSeen: now,
        lastSeen: now,
      });
    }

    totalRateLimited++;

    metricsStore.push({
      method: request.method,
      route: request.url,
      statusCode: 429,
      duration: 0,
      timestamp: now,
    });
    if (metricsStore.length > 500) metricsStore.shift();

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
