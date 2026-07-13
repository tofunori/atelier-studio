/**
 * Slice D+E : pair → threads → open chat (history + composer).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.tsx";
import { __resetSecureStorageForTests } from "../src/native/secureStorage.ts";

beforeEach(() => {
  __resetSecureStorageForTests();
  vi.unstubAllGlobals();
});

function installGatewayMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/remote/health")) {
        return Response.json({
          ok: true,
          protocolVersion: 1,
          minProtocolVersion: 1,
          maxProtocolVersion: 1,
        });
      }
      if (url.includes("/remote/v1/pair")) {
        return Response.json({
          ok: true,
          deviceId: "dev-slice",
          token: "device-token",
          scopes: ["chat:read", "chat:send"],
          name: "iPhone Test",
          protocolVersion: 1,
        });
      }
      if (url.includes("/remote/v1/send")) {
        return Response.json({ ok: true, accepted: true, replay: false });
      }
      if (url.includes("/remote/v1/interrupt")) {
        return Response.json({ ok: true, interrupted: true });
      }
      if (url.includes("/remote/v1/threads/") && url.includes("/history")) {
        const events = Array.from({ length: 14 }, (_, i) => ({
          kind: i % 7 === 0 ? "user" : "text",
          text: `message ${i + 1}`,
          meta: {
            eventId: `ev-${i + 1}`,
            sequence: i + 1,
            schemaVersion: 1,
            provider: "claude",
            threadId: "thread-small",
            turnId: `turn-${Math.floor(i / 7) + 1}`,
            ts: 1,
            durable: true,
            origin: "provider",
          },
        }));
        return Response.json({
          type: "history",
          threadId: "thread-small",
          events,
          fromSequence: 1,
          toSequence: 14,
          complete: true,
        });
      }
      if (url.includes("/remote/v1/threads")) {
        return Response.json({
          threads: [
            {
              id: "thread-small",
              title: "Transcript petit",
              provider: "claude",
              status: "idle",
              updatedAt: "2026-07-09",
              projectId: null,
              lastSequence: 14,
            },
          ],
        });
      }
      return new Response(JSON.stringify({ error: "unexpected " + url, init }), {
        status: 404,
      });
    }),
  );
}

describe("vertical slice D+E", () => {
  it("appairer → lister → ouvrir chat → historique + composer", async () => {
    installGatewayMock();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Réglages" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Réglages" }));
    fireEvent.click(await screen.findByRole("button", { name: /Appairer|Réappareiller/i }));

    const code = await screen.findByLabelText(/Code d'appairage/i);
    fireEvent.change(code, { target: { value: "ABCD2345" } });
    fireEvent.click(screen.getByRole("button", { name: /^Appairer$/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Chats" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Chats" }));

    await waitFor(() => {
      expect(screen.getByText("Transcript petit")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Transcript petit"));

    await waitFor(() => {
      expect(screen.getByText("message 1")).toBeTruthy();
      expect(screen.getByLabelText("Message")).toBeTruthy();
    });
  });
});
