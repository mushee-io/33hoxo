export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  return res.status(200).json({
    service: "33hoxo",
    status: "ok",
    protocolVersion: 1,
    shutterNetwork: "chiado",
    settlement: "solana-devnet",
    adapters: ["maryjane-solana-v1", "sealed-auction-v1"]
  });
}
