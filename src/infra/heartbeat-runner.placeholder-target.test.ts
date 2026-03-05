import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";
import { installHeartbeatRunnerTestRuntime } from "./heartbeat-runner.test-harness.js";
import { seedMainSessionStore, withTempHeartbeatSandbox } from "./heartbeat-runner.test-utils.js";

vi.mock("jiti", () => ({ createJiti: () => () => ({}) }));

installHeartbeatRunnerTestRuntime();

describe("heartbeat placeholder target suppression (#35300)", () => {
  it("does not set OriginatingChannel when session lastTo is 'heartbeat' placeholder", async () => {
    await withTempHeartbeatSandbox(
      async ({ tmpDir, storePath, replySpy }) => {
        const cfg: OpenClawConfig = {
          agents: {
            defaults: {
              workspace: tmpDir,
              heartbeat: {
                every: "5m",
                target: "last",
              },
            },
          },
          session: { store: storePath },
        };

        // Simulate a session where lastChannel is telegram but lastTo is
        // the "heartbeat" placeholder (no real user has interacted yet).
        await seedMainSessionStore(storePath, cfg, {
          lastChannel: "telegram",
          lastProvider: "telegram",
          lastTo: "heartbeat",
        });

        const ctxCapture: Record<string, unknown>[] = [];
        replySpy.mockImplementation(async (ctx: Record<string, unknown>) => {
          ctxCapture.push({ ...ctx });
          return { text: "HEARTBEAT_OK" };
        });

        await runHeartbeatOnce({
          cfg,
          deps: {
            getQueueSize: () => 0,
            nowMs: () => 0,
          },
        });

        // The heartbeat should have run
        expect(replySpy).toHaveBeenCalled();

        // OriginatingChannel should NOT be set to telegram because the
        // delivery target "heartbeat" is a placeholder, not a real user.
        // Setting it would pollute the session's deliveryContext and cause
        // cross-channel delivery errors (#35300).
        const ctx = ctxCapture[0];
        expect(ctx?.OriginatingChannel).toBeUndefined();
        expect(ctx?.OriginatingTo).toBeUndefined();
      },
      { prefix: "openclaw-hb-placeholder-" },
    );
  });
});
