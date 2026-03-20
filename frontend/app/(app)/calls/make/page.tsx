"use client";

import { useState } from "react";
import { initiateCall } from "@/features/calls/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ErrorDisplay } from "@/components/ui/error-display";
import { Empty } from "@/components/ui/empty";

export default function MakeCallPage() {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!phone.trim()) {
      setStatus("error");
      setMessage("Phone number is required.");
      return;
    }
    setStatus("submitting");
    setMessage("");
    try {
      const result = await initiateCall(phone.trim());
      setStatus(result.success ? "success" : "error");
      setMessage(result.message ?? (result.success ? "Call initiated" : "Failed to initiate call"));
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <section>
      <h2>Make Call</h2>
      <p>Initiate outbound call sessions.</p>

      <Card>
        <form onSubmit={handleSubmit} className="form-stack">
          <label htmlFor="phone">Phone number</label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Enter phone number"
            autoComplete="tel"
          />
          <Button type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "Calling…" : "Call"}
          </Button>
        </form>

        {status === "success" && <Empty title={message || "Call initiated successfully."} />}
        {status === "error" && <ErrorDisplay message={message || "Unable to initiate call."} />}
      </Card>
    </section>
  );
}
