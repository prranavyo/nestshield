import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NestShieldModule } from './nestshield.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    NestShieldModule.forRoot({   
      dashboardSecret: '878dad8d9dc6b83aa157d726fdf9cc573a4d28e8114a496b38a1172d41e2f945',
      throttle: {
        ttl:   60000,
        limit: 100,
      },
      alerts: {
        email: 'nestshield.alerts@gmail.com', // your alert email
      },
    }),  
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
