import { Module, DynamicModule, Global } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD }    from '@nestjs/core';
import { ThrottlerModule }               from '@nestjs/throttler';
import { MetricsGateway }                from './core/metrics.gateway';
import { MetricsService }                from './core/metrics.service';
import { MetricsInterceptor }            from './core/metrics.interceptor';
import { NestShieldGuard }               from './guards/nestshield-throttle.guard';
import { AlertService }                  from './alerts/alert.service';
import { NestShieldController }          from './dashboard/nestshield.controller';
import { DashboardAuthService }          from './dashboard/dashboard-auth.service';
import { DashboardAuthGuard }            from './dashboard/dashboard-auth.guard';

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
  /**
   * Secret key to protect the /nestshield/ui dashboard.
   *
   * The developer enters this on the login page.
   * Minimum 16 characters. Generate a safe one with:
   *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   *
   * If omitted, dashboard is UNPROTECTED — development only.
   */
  dashboardSecret?: string;
}

@Global()
@Module({})
export class NestShieldModule {
  static forRoot(options: NestShieldOptions = {}): DynamicModule {
    const throttleTtl     = options.throttle?.ttl   ?? 60000;
    const throttleLimit   = options.throttle?.limit  ?? 100;
    const dashboardSecret = options.dashboardSecret  ?? '';

    if (!dashboardSecret) {
      console.warn(
        '\n[NestShield] WARNING: dashboardSecret is not set.' +
        '\n             /nestshield/ui is publicly accessible.' +
        '\n             Set dashboardSecret in forRoot() for production.\n',
      );
    }

    return {
      global      : true,
      module      : NestShieldModule,
      imports     : [
        ThrottlerModule.forRoot([{ ttl: throttleTtl, limit: throttleLimit }]),
      ],
      controllers : [NestShieldController],
      providers   : [
        MetricsGateway,
        MetricsService,

        // Alert service — pass full options
        {
          provide    : AlertService,
          useFactory : () => new AlertService(options),
        },

        // DashboardAuthService — secret injected directly from options, zero DB
        {
          provide    : DashboardAuthService,
          useFactory : () => new DashboardAuthService(
            dashboardSecret || 'dev-only-insecure-placeholder',
          ),
        },

        // ✅ FIX: Use APP_GUARD so NestJS DI properly injects DashboardAuthService
        //         into the guard. Plain provider + @UseGuards() on controller does
        //         NOT guarantee DI injection in a dynamic/global module context.
        {
          provide  : APP_GUARD,
          useClass : DashboardAuthGuard,
        },

        // Global interceptor + throttle guard
        { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
        { provide: APP_GUARD,       useClass: NestShieldGuard    },
      ],
      exports : [MetricsService, AlertService, DashboardAuthService],
    };
  }
}