import { authorizeOwnedIntent } from "../../../../lib/server/auth.js";
import { cancelIntent, getIntent } from "../../../../lib/server/intentStore.js";
import { publicIntent } from "../../../../lib/server/publicIntent.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    const commitment = String(req.query.commitment || "");
    const existing = await getIntent(commitment);
    if (!existing) return res.status(404).json({ error: "Unknown commitment." });
    authorizeOwnedIntent(req, existing);
    const record = await cancelIntent(commitment);
    return res.status(200).json(publicIntent(record));
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
