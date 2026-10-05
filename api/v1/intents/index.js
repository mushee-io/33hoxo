import { authorizeIntentWrite } from "../../../lib/server/auth.js";
import { insertIntent, listIntents } from "../../../lib/server/intentStore.js";
import { publicIntent } from "../../../lib/server/publicIntent.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    if (req.method === "GET") {
      const records = await listIntents(req.query.limit);
      return res.status(200).json({
        intents: records.map(publicIntent),
      });
    }

    if (req.method === "POST") {
      const auth = authorizeIntentWrite(req);
      const record = await insertIntent(req.body, auth.ownerWallet);
      return res.status(202).json(publicIntent(record));
    }

    res.setHeader("allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
