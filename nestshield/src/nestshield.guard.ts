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
    // Never rate limit the dashboard itself
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
    const ip = request.ip ||
      request.headers['x-forwarded-for'] ||
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

    console.log(`[NestShield] Rate limited: ${ip} (${blockedIPsStore.get(ip)!.hits} hits)`);

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}