import { authorizeOwnedIntent } from "../../lib/server/auth.js";
import { getIntent, markExecuting } from "../../lib/server/intentStore.js";
import { publicIntent } from "../../lib/server/publicIntent.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const commitment = String(req.body?.commitment || "");
    const signature = String(req.body?.signature || "");
    if (!commitment || !signature) {
      return res.status(400).json({ error: "commitment and signature are required." });
    }

    const existing = await getIntent(commitment);
    if (!existing) return res.status(404).json({ error: "Unknown commitment." });
    authorizeOwnedIntent(req, existing);

    const record = await markExecuting(commitment, signature);
    return res.status(202).json(publicIntent(record));
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
