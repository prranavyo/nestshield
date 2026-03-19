import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { MetricsGateway }     from './core/metrics.gateway';
import { MetricsService }     from './core/metrics.service';
import { MetricsInterceptor } from './core/metrics.interceptor';
import { NestShieldGuard }    from './guards/nestshield.guard';
import { AlertService }       from './alerts/alert.service';
import { NestShieldController } from './dashboard/nestshield.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
  ],
  controllers: [NestShieldController],
  providers: [
    MetricsGateway,
    MetricsService,
    AlertService,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_GUARD,       useClass: NestShieldGuard    },
  ],
  exports: [MetricsService, AlertService],
})
export class NestShieldModule {}
