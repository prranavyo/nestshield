import { CanActivate,ExecutionContext,Injectable} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DashboardAuthService } from './dashboard-auth.service';

@Injectable()
export class DashboardAuthGuard implements CanActivate {
  constructor(private readonly authService: DashboardAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req: Request  = context.switchToHttp().getRequest();
    const res: Response = context.switchToHttp().getResponse();
    const route: string = req.path || req.url || '';

    // Login route — always open, no token needed
    if (route === '/nestshield/auth/login') return true;

    // All other /nestshield/* routes — require valid token
    const token = this.extractToken(req);

    if (!token) {
      this.redirectToLogin(res);
      return false;
    }

    const payload = this.authService.verifyToken(token);

    if (!payload) {
      // Token invalid or expired — clear cookie and redirect
      res.clearCookie('ns_token');
      this.redirectToLogin(res);
      return false;
    }

    return true;
  }

  // ── Cookie extraction ────────────────────────────────────────────────────────
  // Reads the HttpOnly cookie.  Falls back to parsing Cookie header manually
  // in case cookie-parser middleware is not registered in the host app.
  private extractToken(req: Request): string | null {
    // Via cookie-parser middleware (preferred)
    if (req.cookies?.ns_token) return req.cookies.ns_token as string;

    // Manual fallback — parse Cookie header directly
    const raw = req.headers.cookie || '';
    const match = raw.match(/(?:^|;\s*)ns_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private redirectToLogin(res: Response): void {
    res.redirect('/nestshield/auth/login');
  }
}