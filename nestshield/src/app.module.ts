import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NestShieldModule } from './nestshield.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    NestShieldModule,  // ← one line to add NestShield to any NestJS app
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
