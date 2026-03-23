// ─── NestShield Public API ────────────────────────────────────────────────────

export { NestShieldModule }         from './nestshield.module';
export { NestShieldController }     from './dashboard/nestshield.controller';
export { DashboardAuthService }     from './dashboard/dashboard-auth.service';
export { DashboardAuthGuard }       from './dashboard/dashboard-auth.guard';
export { MetricsService }           from './core/metrics.service';
export { MetricsGateway }           from './core/metrics.gateway';
export { MetricsInterceptor }       from './core/metrics.interceptor';
export { AlertService }             from './alerts/alert.service';
export {
  NestShieldGuard,
  blockedIPsStore,
  totalRateLimited,
}                                   from './guards/nestshield.guard';
export { metricsStore }             from './core/metrics.store';