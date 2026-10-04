import { requireApiKey } from "../../../../lib/server/auth.js";
import { cancelIntent } from "../../../../lib/server/intentStore.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    requireApiKey(req);
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    const commitment = String(req.query.commitment || "");
    const record = await cancelIntent(commitment);
    return res.status(200).json(record);
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
