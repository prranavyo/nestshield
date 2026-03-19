import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MetricsGateway } from './metrics.gateway';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';
import { NestShieldGuard } from './nestshield.guard';
import { AlertService } from './alert.service';

// No MailerModule — emails go through Resend's HTTP API directly.
// Zero SMTP config. User only needs: RESEND_API_KEY + ALERT_EMAIL

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    MetricsGateway,
    MetricsService,
    AlertService,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_GUARD,       useClass: NestShieldGuard    },
  ],
})
export class AppModule {}
