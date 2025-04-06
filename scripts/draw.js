const {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} = require("@solana/web3.js");
const { getAssociatedTokenAddress, getAccount } = require("@solana/spl-token");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
dotenv.config();

// -------------------- CONFIG --------------------
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const PROGRAM_ID = new PublicKey("GmyMFG4QwHh2YK4bjy489eBzf9Hzf3BLZ1sFfznoeWpB");
const TREASURY = new PublicKey("FrAvtjXo5JCsWrjcphvWCGQDrXX8PuEbN2qu2SGdvurG");
const OPS_WALLET = new PublicKey("nJmonUssRvbp85Nvdd9Bnxgh86Hf6BtKfu49RdcoYE9");
const TIX_MINT = new PublicKey("CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM");

const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.DRAW_PAYER_PRIVATE_KEY))
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------- ENTRY LOGIC --------------------
async function fetchEligibleEntries() {
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .gte("created_at", getLastDrawTime().toISOString())
    .lt("created_at", getNextDrawTime().toISOString());

  if (error) throw new Error("Failed to fetch entries");

  const grouped = {};
  for (const row of data) {
    if (!grouped[row.wallet]) grouped[row.wallet] = { totalEntries: 0, totalTix: 0 };
    grouped[row.wallet].totalEntries += row.entries;
    grouped[row.wallet].totalTix += row.tix_amount;
  }

  const eligible = [];
  for (const wallet of Object.keys(grouped)) {
    const ata = await getAssociatedTokenAddress(TIX_MINT, new PublicKey(wallet), false);
    try {
      const account = await getAccount(connection, ata);
      const currentBalance = Number(account.amount) / 1e6;
      const heldRatio = currentBalance / grouped[wallet].totalTix;
      const effective = Math.min(
        Math.floor(grouped[wallet].totalEntries * heldRatio),
        grouped[wallet].totalEntries
      );
      console.log(`Wallet ${wallet} - currentBalance: ${currentBalance}, purchased: ${grouped[wallet].totalTix}, ratio: ${heldRatio}, entries: ${effective}`);
      if (effective > 0) eligible.push(...Array(effective).fill(wallet));
    } catch (_) {}
  }

  return eligible;
}

function pickRandomWinner(pool) {
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

// -------------------- LOG --------------------
async function logDraw(winner, amount, entries) {
  const { error } = await supabase.from("draws").insert([{
    draw_type: "moon",
    draw_date: new Date().toISOString(),
    winner,
    jackpot_sol: amount / LAMPORTS_PER_SOL,
    entries
  }]);
  if (error) throw new Error("Failed to log draw");
}

// -------------------- MAIN --------------------
async function runDraw() {
  console.log("Fetching entries...");
  const pool = await fetchEligibleEntries();
  if (pool.length === 0) throw new Error("No eligible entries");

  const winner = pickRandomWinner(pool);
  const entries = pool.filter(w => w === winner).length;

  console.log(`Winner: ${winner} with ${entries} entries`);

  const jackpotBalance = await connection.getBalance(TREASURY);
  const buffer = 5000;
  const available = jackpotBalance - buffer;
  if (available <= 0) throw new Error("Not enough SOL");

  const winnerAmount = Math.floor(available * 0.9);
  const opsAmount = available - winnerAmount;

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: TREASURY,
      toPubkey: new PublicKey(winner),
      lamports: winnerAmount,
    }),
    SystemProgram.transfer({
      fromPubkey: TREASURY,
      toPubkey: OPS_WALLET,
      lamports: opsAmount,
    })
  );

  const latestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = payer.publicKey;

  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log("Transaction sent:", sig);

  await logDraw(winner, winnerAmount + opsAmount, entries);
  console.log("Draw complete.");
}

runDraw().catch(console.error);

// -------------------- TIME --------------------
function getLastDrawTime() {
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  let daysSinceMonday = (day + 6) % 7;
  if (day === 1 && hour < 3) daysSinceMonday = 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday, 3));
}

function getNextDrawTime() {
  const last = getLastDrawTime();
  return new Date(last.getTime() + 7 * 24 * 60 * 60 * 1000);
}
