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
      dashboardSecret: process.env.NESTSHIELD_SECRET,
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
