import { Module, DynamicModule, Global } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { MetricsGateway }       from './core/metrics.gateway';
import { MetricsService }       from './core/metrics.service';
import { MetricsInterceptor }   from './core/metrics.interceptor';
import { NestShieldGuard }      from './guards/nestshield.guard';
import { AlertService }         from './alerts/alert.service';
import { NestShieldController } from './dashboard/nestshield.controller';

export interface NestShieldAlertOptions {
  /** Your email — alerts will be sent here from NestShield */
  email: string;
  /** Error rate % that triggers a CRITICAL alert (default: 5) */
  errorRateThreshold?: number;
  /** P95 latency in ms that triggers a WARNING alert (default: 1000) */
  latencyThreshold?: number;
  /** Cooldown between same alert type in ms (default: 600000 = 10 min) */
  cooldownMs?: number;
}

export interface NestShieldThrottleOptions {
  /** Time window in milliseconds (default: 60000 = 1 min) */
  ttl?: number;
  /** Max requests per IP per window (default: 100) */
  limit?: number;
}

export interface NestShieldOptions {
  throttle?: NestShieldThrottleOptions;
  alerts?: NestShieldAlertOptions;
}

@Global()
@Module({})
export class NestShieldModule {
  static forRoot(options: NestShieldOptions = {}): DynamicModule {
    const throttleTtl   = options.throttle?.ttl   ?? 60000;
    const throttleLimit = options.throttle?.limit  ?? 100;

    return {
      global: true,
      module: NestShieldModule,
      imports: [
        ThrottlerModule.forRoot([{ ttl: throttleTtl, limit: throttleLimit }]),
      ],
      controllers: [NestShieldController],
      providers: [
        MetricsGateway,
        MetricsService,
        // ── Pass options directly via factory — no token injection needed ──
        {
          provide:    AlertService,
          useFactory: () => new AlertService(options),
        },
        { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
        { provide: APP_GUARD,       useClass: NestShieldGuard    },
      ],
      exports: [MetricsService, AlertService],
    };
  }
}