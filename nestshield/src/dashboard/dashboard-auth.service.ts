import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class DashboardAuthService {
  private readonly secret: string;
  private readonly expirySeconds = 8 * 60 * 60; // 8 hours

  constructor(secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error(
        '[NestShield] dashboardSecret must be at least 16 characters. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    this.secret = secret;
  }

  // ── Timing-safe password check ──────────────────────────────────────────────
  // No bcrypt needed — secret is machine-generated, not a human password.
  // We just do a constant-time comparison to prevent timing attacks.
  validateSecret(input: string): boolean {
    try {
      const a = Buffer.from(input.padEnd(128));
      const b = Buffer.from(this.secret.padEnd(128));
      return (
        a.length === b.length &&
        crypto.timingSafeEqual(a, b) &&
        input === this.secret
      );
    } catch {
      return false;
    }
  }

  // ── Minimal JWT using Node crypto — zero external deps ──────────────────────
  signToken(): string {
    const header  = this.b64({ alg: 'HS256', typ: 'JWT' });
    const payload = this.b64({
      role : 'admin',
      iat  : Math.floor(Date.now() / 1000),
      exp  : Math.floor(Date.now() / 1000) + this.expirySeconds,
    });
    const sig = this.hmac(`${header}.${payload}`);
    return `${header}.${payload}.${sig}`;
  }

  verifyToken(token: string): { role: string; exp: number } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [header, payload, sig] = parts;

      // 1. Verify signature — timing-safe
      const expected = Buffer.from(this.hmac(`${header}.${payload}`));
      const actual   = Buffer.from(sig);
      if (expected.length !== actual.length) return null;
      if (!crypto.timingSafeEqual(expected, actual)) return null;

      // 2. Check expiry
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (Math.floor(Date.now() / 1000) > data.exp) return null;

      return data;
    } catch {
      return null;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private b64(obj: object): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64url');
  }

  private hmac(data: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('base64url');
  }
}