import { requireCron } from "../../lib/server/auth.js";
import { revealCandidates, rowToRecord } from "../../lib/server/intentStore.js";
import { revealOne } from "../../lib/server/revealOne.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    requireCron(req);
    if (req.method !== "POST" && req.method !== "GET") {
      res.setHeader("allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const rows = await revealCandidates(50);
    const results = [];
    for (const row of rows) {
      results.push(await revealOne(rowToRecord(row)));
    }

    return res.status(200).json({
      processed: results.length,
      results,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
