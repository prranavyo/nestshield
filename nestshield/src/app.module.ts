import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MetricsGateway } from './metrics.gateway';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';
import { Metric } from './metric.entity';
import { NestShieldGuard } from './nestshield.guard';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'nestshield',
      entities: [Metric],
      synchronize: true, // auto creates table
    }),
    TypeOrmModule.forFeature([Metric]),
    ThrottlerModule.forRoot([{
      ttl: 60000,   // 60 seconds window
      limit: 5,   // max 100 requests per window per IP
    }]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    MetricsGateway,
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_GUARD,       // ← was missing
      useClass: NestShieldGuard, // ← was missing
    },
  ],
})
export class AppModule {}
