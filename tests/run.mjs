// Runs the logic checks: each tests/check-*.ts is bundled with esbuild (the Durable Object base
// class is stubbed, since workerd cannot run on every machine) and executed with Node.
// The checks call the real worker code with fake storage, D1 and Workers AI; no network, no quota.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, ".out");
mkdirSync(out, { recursive: true });

let failed = 0;
for (const file of readdirSync(here).filter((f) => /^check-.*\.ts$/.test(f))) {
  const outfile = join(out, file.replace(/\.ts$/, ".mjs"));
  await build({
    entryPoints: [join(here, file)],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "error",
    plugins: [
      {
        name: "stub-cloudflare-workers",
        setup(b) {
          b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(here, "do-stub.ts") }));
        },
      },
    ],
  });
  const run = spawnSync(process.execPath, [outfile], { encoding: "utf8" });
  // stderr carries expected noise (the checks simulate Workers AI failing); results are on stdout.
  const output = `${run.stdout}${run.status === 0 ? "" : run.stderr}`.trim();
  const ok = run.status === 0 && run.stdout.trim().endsWith("all checks passed");
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${file}`);
  if (!ok) console.log(output.split("\n").slice(-20).join("\n"));
}
process.exit(failed ? 1 : 0);
