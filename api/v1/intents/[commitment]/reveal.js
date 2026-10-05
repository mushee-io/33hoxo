import { authorizeOwnedIntent } from "../../../../lib/server/auth.js";
import { getIntent } from "../../../../lib/server/intentStore.js";
import { revealOne } from "../../../../lib/server/revealOne.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const commitment = String(req.query.commitment || "");
    const record = await getIntent(commitment);
    if (!record) return res.status(404).json({ error: "Unknown commitment." });
    authorizeOwnedIntent(req, record);

    const result = await revealOne(record);
    return res.status(result.status === "RETRYABLE" ? 202 : 200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
