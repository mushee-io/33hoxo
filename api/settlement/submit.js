import { requireApiKey } from "../../lib/server/auth.js";
import { markExecuting } from "../../lib/server/intentStore.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    requireApiKey(req);
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const commitment = String(req.body?.commitment || "");
    const signature = String(req.body?.signature || "");
    if (!commitment || !signature) {
      return res.status(400).json({ error: "commitment and signature are required." });
    }

    const record = await markExecuting(commitment, signature);
    return res.status(202).json(record);
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
