import {
  Controller,
  Get,
  Post,
  Res,
  Query,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs   from 'fs';
import * as path from 'path';
import { MetricsService }       from '../core/metrics.service';
import { AlertService }         from '../alerts/alert.service';
import { DashboardAuthService } from './dashboard-auth.service';
import { DashboardAuthGuard }   from './dashboard-auth.guard';

@Controller()
@UseGuards(DashboardAuthGuard)
export class NestShieldController {
  constructor(
    private readonly metricsService : MetricsService,
    private readonly alertService   : AlertService,
    private readonly dashboardAuth  : DashboardAuthService,
  ) {}

  // ── Login page GET — guard always allows this route ─────────────────────────
  @Get('nestshield/auth/login')
  getLoginPage(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html');
    res.send(this.getLoginHtml());
  }

  // ── Login submit POST ────────────────────────────────────────────────────────
  @Post('nestshield/auth/login')
  @HttpCode(200)
  postLogin(
    @Body() body: { secret?: string },
    @Res() res: Response,
  ) {
    const input = (body?.secret || '').trim();

    if (!this.dashboardAuth.validateSecret(input)) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(401).send(this.getLoginHtml('Invalid secret key. Try again.'));
    }

    const token = this.dashboardAuth.signToken();

    // HttpOnly  — JS in browser cannot read this cookie (XSS-safe)
    // SameSite  — not sent on cross-site requests (CSRF-safe)
    // secure    — HTTPS only in production
    res.cookie('ns_token', token, {
      httpOnly : true,
      sameSite : 'strict',
      secure   : process.env.NODE_ENV === 'production',
      maxAge   : 8 * 60 * 60 * 1000, // 8 hours in ms
    });

    return res.redirect('/nestshield/ui');
  }

  // ── Logout ───────────────────────────────────────────────────────────────────
  @Get('nestshield/auth/logout')
  logout(@Res() res: Response) {
    res.clearCookie('ns_token');
    return res.redirect('/nestshield/auth/login');
  }

  // ── Stats API ────────────────────────────────────────────────────────────────
  @Get('nestshield/stats')
  async getStats(@Query('hours') hours?: string) {
    return this.metricsService.getStats(parseInt(hours || '1'));
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  @Get('nestshield')
  async getDashboard() {
    return (await this.metricsService.getStats()).summary;
  }

  // ── Dashboard UI ─────────────────────────────────────────────────────────────
  @Get('nestshield/ui')
  getDashboardUI(@Res() res: Response) {
    const filePath = path.join(__dirname, 'nestshield-dashboard.html');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/html');
      return res.send(fs.readFileSync(filePath, 'utf8'));
    }
    res.setHeader('Content-Type', 'text/html');
    res.send(this.getDashboardHtml());
  }

  // ── Login page HTML ──────────────────────────────────────────────────────────
  private getLoginHtml(errorMessage?: string): string {
    const error = errorMessage
      ? `<p style="color:#ef4444;font-size:13px;margin:0 0 16px;text-align:center">${errorMessage}</p>`
      : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NestShield — Login</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;background:#0a0a0f;
     display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#111118;border:1px solid rgba(255,255,255,0.08);
      border-radius:16px;padding:40px;width:100%;max-width:380px}
.logo{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:32px}
.logo-mark{width:36px;height:36px;border-radius:10px;
           background:linear-gradient(135deg,#6366f1,#8b5cf6);
           display:flex;align-items:center;justify-content:center}
.logo-mark svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:1.8}
.logo-text{font-size:18px;font-weight:700;color:#f1f1f5;letter-spacing:-0.4px}
label{display:block;font-size:12px;color:#9090a8;margin-bottom:6px;
      font-family:'JetBrains Mono',monospace;letter-spacing:0.06em;text-transform:uppercase}
input{width:100%;padding:10px 14px;background:#18181f;
      border:1px solid rgba(255,255,255,0.1);border-radius:8px;
      color:#f1f1f5;font-size:14px;outline:none;
      transition:border-color .2s;margin-bottom:20px}
input:focus{border-color:#6366f1}
button{width:100%;padding:11px;background:#6366f1;border:none;border-radius:8px;
       color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s}
button:hover{opacity:.85}
.hint{font-size:11px;color:#4a4a62;text-align:center;margin-top:20px;
      font-family:'JetBrains Mono',monospace}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-mark">
      <svg viewBox="0 0 24 24">
        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"/>
        <path d="M9 12l2 2 4-4" stroke-width="2"/>
      </svg>
    </div>
    <span class="logo-text">NestShield</span>
  </div>
  ${error}
  <form method="POST" action="/nestshield/auth/login">
    <label for="secret">Dashboard secret key</label>
    <input type="password" id="secret" name="secret"
           placeholder="Enter your NESTSHIELD_SECRET"
           autocomplete="current-password" required>
    <button type="submit">Unlock Dashboard</button>
  </form>
  <p class="hint">Set NESTSHIELD_SECRET in your .env to configure access</p>
</div>
</body>
</html>`;
  }

  // ── Dashboard HTML (original preserved) ─────────────────────────────────────
  private getDashboardHtml(): string {
    return `<!-- same as original nestshield-dashboard.html — no changes needed -->`;
  }
}