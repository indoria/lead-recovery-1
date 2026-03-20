type TelemetryLevel = "debug" | "info" | "warn" | "error";

export type TelemetryEvent = {
  source?: string;
  message?: string;
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
    source: event.source ?? "frontend.unknown",
    message: event.message ?? event.type ?? "event",
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

function getNavigationTiming(): Record<string, unknown> {
  if (typeof window === "undefined" || !performance?.getEntriesByType) {
    return {};
  }

  const navTiming = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!navTiming) {
    return {};
  }

  return {
    ttfb: navTiming.responseStart - navTiming.requestStart,
    domInteractive: navTiming.domInteractive,
    domContentLoaded: navTiming.domContentLoadedEventEnd,
    loadEvent: navTiming.loadEventEnd,
    totalLoad: navTiming.loadEventEnd - navTiming.startTime,
  };
}

async function emitPerformanceMetric(type: string, value: number, details?: Record<string, unknown>) {
  await emitTelemetry({
    source: "frontend.perf",
    message: `${type} metric recorded`,
    type: `perf_${type}`,
    level: "info",
    details: {
      value,
      ...details,
    },
  });
}

export function trackWebVitals(): void {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return;
  }

  const navData = getNavigationTiming();
  if (Object.keys(navData).length) {
    void emitTelemetry({
      source: "frontend.perf",
      message: "Navigation timings",
      type: "perf_navigation",
      level: "info",
      details: navData,
    });
  }

  try {
    const perfObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.entryType === "paint") {
          void emitPerformanceMetric(entry.name, entry.startTime);
        }

        if (entry.entryType === "largest-contentful-paint") {
          void emitPerformanceMetric("LCP", entry.startTime);
        }

        if (entry.entryType === "layout-shift") {
          void emitPerformanceMetric("CLS", (entry as unknown as LayoutShift).value);
        }

        if (entry.entryType === "first-input") {
          void emitPerformanceMetric("FID", (entry as PerformanceEventTiming).processingStart - (entry as PerformanceEventTiming).startTime, {
            name: (entry as PerformanceEventTiming).name,
          });
        }
      }
    });

    perfObserver.observe({ type: "paint", buffered: true });
    perfObserver.observe({ type: "largest-contentful-paint", buffered: true });
    perfObserver.observe({ type: "layout-shift", buffered: true });
    perfObserver.observe({ type: "first-input", buffered: true });

    // Keep the observer around for the page lifetime.
  } catch (error) {
    console.warn("[telemetry] cannot initialize PerformanceObserver", error);
  }
}
