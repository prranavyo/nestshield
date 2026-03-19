import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { MetricsGateway } from './metrics.gateway';
import { MetricsService } from './metrics.service';
import { metricsStore } from './metrics.store';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly gateway: MetricsGateway,
    private readonly metricsService: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req    = context.switchToHttp().getRequest();
    const res    = context.switchToHttp().getResponse();
    const method = req.method;
    const route  = req.url;
    const start  = Date.now();

    // Capture controller + handler name for richer error context in emails
    const controllerName = context.getClass()?.name || 'Unknown';
    const handlerName    = context.getHandler()?.name || 'unknown';

    if (route.startsWith('/nestshield')) return next.handle();

    const pushEvent = (statusCode: number, errorMessage?: string) => {
      const event: any = {
        method,
        route,
        statusCode,
        duration:       Date.now() - start,
        timestamp:      new Date().toISOString(),
        controllerName,
        handlerName,
      };

      if (statusCode >= 400 && errorMessage) {
        event.errorMessage = errorMessage;
        event.errorType    = statusCode >= 500 ? 'Server Error'
                           : statusCode === 429 ? 'Too Many Requests'
                           : statusCode === 404 ? 'Not Found'
                           : statusCode === 401 ? 'Unauthorized'
                           : statusCode === 403 ? 'Forbidden'
                           : 'Client Error';
      }

      metricsStore.push(event);
      if (metricsStore.length > 1000) metricsStore.shift();

      const stats = this.metricsService.getStatsSync();
      this.gateway.sendUpdate(stats);
    };

    return next.handle().pipe(
      tap(() => pushEvent(res.statusCode)),
      catchError((err) => {
        const statusCode   = err?.status || err?.statusCode || 500;
        const errorMessage =
          (typeof err?.response === 'string' ? err.response : null) ||
          err?.response?.message ||
          err?.message ||
          'Internal server error';
        pushEvent(statusCode, String(errorMessage));
        return throwError(() => err);
      }),
    );
  }
}
