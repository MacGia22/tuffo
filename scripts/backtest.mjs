// Prints the chlorine model's walk-forward backtest on the live beta data.
//
//   CRON_SECRET=… node scripts/backtest.mjs [https://tuffo.app]
//
// The numbers come from /api/jobs/backtest, which runs on the server with the data in
// place; nothing personal is returned.

const base = (process.argv[2] ?? "https://tuffo.app").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET (the same value as in Vercel).");
  process.exit(2);
}

const response = await fetch(`${base}/api/jobs/backtest`, { headers: { authorization: `Bearer ${secret}` } });
const body = await response.json().catch(() => null);
if (!response.ok || !body?.ok) {
  console.error(`Backtest failed: HTTP ${response.status} ${body?.error ?? ""}`);
  process.exit(1);
}

const ppm = (v) => (v === null ? "  —  " : `${v.toFixed(2)} ppm`);
console.log("pool  pairs  usable  predicted  median error");
for (const p of body.pools) {
  console.log(
    `${String(p.pool).padStart(4)}  ${String(p.pairs).padStart(5)}  ${String(p.usable).padStart(6)}  ${String(p.predictions).padStart(9)}  ${ppm(p.medianError)}`,
  );
}
const s = body.summary;
console.log("");
console.log(`Predictions with 4+ pairs of history: ${s.predictions}`);
console.log(`Median error, fitted model:  ${ppm(s.medianError)}`);
console.log(`Median error, average pool:  ${ppm(s.medianPriorOnlyError)}`);
console.log(`Launch gate (≤ 1.0 ppm):     ${s.meetsGate === null ? "not enough data yet" : s.meetsGate ? "met" : "not met"}`);
