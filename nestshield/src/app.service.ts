import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'NestShield is running! Open /nestshield/ui to see the dashboard.';
  }
}
