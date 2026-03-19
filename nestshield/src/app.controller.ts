import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

// ─── Your application routes go here ─────────────────────────────────────────
// NestShield routes (/nestshield/ui, /nestshield/stats etc.)
// are handled automatically by NestShieldModule.

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // ── Example routes — replace with your real API ───────────────────────────

  @Get('api/users')
  getUsers() {
    return [
      { id: 1, name: 'Pranav' },
      { id: 2, name: 'Test User' },
    ];
  }

  @Get('api/products')
  getProducts() {
    return [
      { id: 1, name: 'NestShield Pro' },
      { id: 2, name: 'NestShield Free' },
    ];
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
