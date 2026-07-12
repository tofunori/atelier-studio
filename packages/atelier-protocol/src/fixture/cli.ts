/**
 * CLI: node --experimental-strip-types src/fixture/cli.ts [--port 9876] [--scenario small]
 */
import { startFixtureServer } from "./server.ts";
import type { FixtureScenarioId } from "./engine.ts";

const args = process.argv.slice(2);
function flag(name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}

const port = Number(flag("--port", "0"));
const scenario = (flag("--scenario", "small") ?? "small") as FixtureScenarioId;

const server = await startFixtureServer({
  port: Number.isFinite(port) ? port : 0,
  scenario,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      url: server.url,
      wsUrl: server.wsUrl,
      port: server.port,
      scenario,
    },
    null,
    2,
  ),
);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
