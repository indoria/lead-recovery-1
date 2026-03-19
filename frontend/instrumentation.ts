type TelemetryLevel = "debug" | "info" | "warn" | "error";

export type TelemetryEvent = {
  source: string;
  message: string;
  type?: string;
  level?: TelemetryLevel;
  route?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  [key: string]: unknown;
};

const TELEMETRY_ENDPOINT =
  process.env.TELEMETRY_ENDPOINT ?? process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT;

function toPayload(event: TelemetryEvent): Required<TelemetryEvent> {
  return {
    level: event.level ?? "info",
    route: event.route ?? "",
    details: event.details ?? {},
    timestamp: event.timestamp ?? new Date().toISOString(),
    source: event.source,
    message: event.message,
  };
}

function writeConsole(payload: Required<TelemetryEvent>) {
  const line = `[telemetry] ${payload.level.toUpperCase()} ${payload.source}: ${payload.message}`;
  if (payload.level === "error") {
    console.error(line, payload);
    return;
  }
  if (payload.level === "warn") {
    console.warn(line, payload);
    return;
  }
  console.log(line, payload);
}

export async function emitTelemetry(event: TelemetryEvent): Promise<void> {
  const payload = toPayload(event);
  writeConsole(payload);

  if (!TELEMETRY_ENDPOINT) {
    return;
  }

  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (error) {
    console.warn("[telemetry] Failed to forward telemetry event", error);
  }
}

export async function register(): Promise<void> {
  await emitTelemetry({
    source: "frontend.instrumentation",
    message: "Next.js frontend instrumentation initialized",
    level: "info",
  });
}
