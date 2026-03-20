"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { logClientEvent } from "@/lib/telemetry/client";
import { trackWebVitals } from "@/instrumentation";

export function RouteChangeTelemetry() {
  const pathname = usePathname();

  useEffect(() => {
    void trackWebVitals();
    void logClientEvent({
      source: "frontend.navigation",
      message: "Route change",
      level: "info",
      route: pathname,
    });
  }, [pathname]);

  return null;
}
