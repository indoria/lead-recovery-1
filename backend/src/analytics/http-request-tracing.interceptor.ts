import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, catchError, finalize, throwError } from 'rxjs';
import { CallEventStoreService } from './call-event-store.service';

type TraceableRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
  route?: { path?: string };
  callEventRequestId?: string;
};

type TraceableResponse = {
  statusCode?: number;
};

@Injectable()
export class HttpRequestTracingInterceptor implements NestInterceptor {
  constructor(private readonly callEventStore: CallEventStoreService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<TraceableRequest>();
    const response = context.switchToHttp().getResponse<TraceableResponse>();
    const requestId = randomUUID();
    const method = request.method ?? 'GET';
    const path = request.originalUrl ?? request.url ?? 'unknown';
    const category = path.includes('/telephony/events') ? 'webhook' : 'system-api';
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();

    request.callEventRequestId = requestId;

    this.callEventStore.recordEvent({
      eventName: 'http.request',
      category,
      direction: 'inbound',
      phase: 'start',
      requestId,
      method,
      path,
      occurredAt: startedAt,
      payload: request.route?.path ? { routePath: request.route.path } : undefined,
    });

    let statusCode = response.statusCode;
    let success = true;

    return next.handle().pipe(
      catchError((error: unknown) => {
        statusCode =
          typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
            ? error.status
            : 500;
        success = false;
        return throwError(() => error);
      }),
      finalize(() => {
        const finalStatusCode = statusCode ?? response.statusCode ?? (success ? 200 : 500);
        this.callEventStore.recordEvent({
          eventName: 'http.request',
          category,
          direction: 'inbound',
          phase: 'end',
          requestId,
          method,
          path,
          statusCode: finalStatusCode,
          success: success && finalStatusCode < 500,
          occurredAt: new Date().toISOString(),
          relatedStartedAt: startedAt,
          durationMs: Date.now() - startedAtMs,
        });
      }),
    );
  }
}