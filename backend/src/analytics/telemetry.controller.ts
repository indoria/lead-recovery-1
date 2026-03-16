import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { EventBus } from './event-bus';

interface TelemetryPayload {
  type?: string;
  [key: string]: unknown;
}

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly eventBus: EventBus) {}

  @Get()
  info() {
    return {
      ok: true,
      message: 'Telemetry endpoint is available. Use POST to submit telemetry payloads.',
    };
  }

  @Post()
  ingest(@Body() payload: unknown) {
    if (!isRecord(payload)) {
      throw new BadRequestException('telemetry payload must be an object');
    }

    const body = payload as TelemetryPayload;
    this.eventBus.emit({
      type: 'telemetry.client',
      payload: {
        ...body,
        telemetryType: typeof body.type === 'string' ? body.type : 'unknown',
        receivedAt: new Date().toISOString(),
      },
    });

    return {
      ok: true,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
