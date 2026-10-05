import { createWalletChallenge } from "../../lib/server/walletAuth.js";

export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  try {
    if (req.method !== "GET") {
      res.setHeader("allow", "GET");
      return res.status(405).json({ error: "Method not allowed." });
    }
    const wallet = String(req.query.wallet || "");
    return res.status(200).json(createWalletChallenge(wallet));
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
