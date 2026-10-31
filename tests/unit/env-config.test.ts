import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const loader = require.resolve("tsx");
const config = resolve("env.config.ts");

test("CLI environment loading matches Next.js precedence and respects explicit variables", () => {
  const directory = mkdtempSync(join(tmpdir(), "teamflow-env-test-"));
  try {
    writeFileSync(join(directory, ".env"), "TEAMFLOW_ENV_PROBE=base\n");
    writeFileSync(join(directory, ".env.local"), "TEAMFLOW_ENV_PROBE=local\n");
    writeFileSync(join(directory, ".env.test"), "TEAMFLOW_ENV_PROBE=test\n");
    const probe = join(directory, "probe.ts");
    writeFileSync(probe, `import ${JSON.stringify(config)}; process.stdout.write(process.env.TEAMFLOW_ENV_PROBE ?? "missing");`);
    const run = (mode: NodeJS.ProcessEnv["NODE_ENV"], explicit?: string) => {
      const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: mode };
      delete env.__NEXT_PROCESSED_ENV;
      delete env.TEAMFLOW_ENV_PROBE;
      if (explicit) env.TEAMFLOW_ENV_PROBE = explicit;
      return execFileSync(process.execPath, ["--import", loader, probe], { cwd: directory, env, encoding: "utf8" });
    };
    assert.equal(run("development"), "local");
    assert.equal(run("test"), "test");
    assert.equal(run("development", "explicit"), "explicit");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
