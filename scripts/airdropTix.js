const { execSync } = require("child_process");

// === Replace with your actual values ===
const TOKEN_MINT = "CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM"; // $TIX
const PHANTOM_ADDRESS = "J1nyRTSBjmLB23pafAB2Rn97BeFoJEhGN8W71YfSvCnJ"; // Treasury wallet ATA address
const AMOUNT = 10000000000; // 10 billion $TIX (9 decimals)

try {
  console.log("Transferring tokens to Phantom address...");
  execSync(
    `spl-token transfer ${TOKEN_MINT} ${AMOUNT} ${PHANTOM_ADDRESS} --fund-recipient --allow-unfunded-recipient --url https://api.devnet.solana.com`,
    { stdio: "inherit" }
  );
  console.log("✅ Airdrop complete!");
} catch (err) {
  console.error("❌ Error during airdrop:", err.message);
}
