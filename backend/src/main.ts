import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './common/config/app-config.service';
import { CorrelationIdService } from './common/logger/correlation-id.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('api');

  const allowedOrigins = [
    'https://verbose-broccoli-q6grrx4p95f49j5-5173.app.github.dev',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  app.enableCors({
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow non-browser clients and same-origin requests with no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-CSRF-Token'],
    exposedHeaders: ['X-Correlation-ID'],
    optionsSuccessStatus: 204,
    credentials: true,
  });

  const configService = app.get(AppConfigService);
  const correlationIdService = app.get(CorrelationIdService);

  app.use((request: { headers: Record<string, string | string[] | undefined> }, response: unknown, next: () => void) => {
    const headerName = configService.getConfig().logging.correlationIdHeader.toLowerCase();
    const headerValue = request.headers[headerName];
    const correlationId = Array.isArray(headerValue)
      ? headerValue[0]
      : headerValue ?? crypto.randomUUID();

    correlationIdService.run(correlationId, next);
  });

  await app.listen(configService.getConfig().app.port);
}

void bootstrap();