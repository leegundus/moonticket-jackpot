const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });

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

// -------------------- CONFIG --------------------
const connection = new Connection(process.env.RPC_URL, "confirmed");
const PROGRAM_ID = new PublicKey("GmyMFG4QwHh2YK4bjy489eBzf9Hzf3BLZ1sFfznoeWpB");
const TREASURY = new PublicKey("FrAvtjXo5JCsWrjcphvWCGQDrXX8PuEbN2qu2SGdvurG");
const OPS_WALLET = new PublicKey("nJmonUssRvbp85Nvdd9Bnxgh86Hf6BtKfu49RdcoYE9");
const TIX_MINT = new PublicKey("8e9Mqnczw7MHjdjYaRe3tppbXgRdT6bqTyR3n8b4C4Ek");

const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.DRAW_PAYER_PRIVATE_KEY))
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------- ENTRY LOGIC --------------------
async function fetchEligibleEntries() {
  // Fetch last draw date
  const { data: draws, error: drawError } = await supabase
    .from("draws")
    .select("draw_date")
    .eq("draw_type", "moon")
    .order("draw_date", { ascending: false })
    .limit(1);

  if (drawError) throw new Error("Failed to fetch last draw");
  const lastDrawTime = draws?.[0]?.draw_date
    ? new Date(draws[0].draw_date)
    : new Date(0); // If no previous draw, include all time

  console.log("Last Draw:", lastDrawTime.toISOString());

  // Fetch entries since last draw
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .gte("created_at", lastDrawTime.toISOString());

  if (error) throw new Error("Failed to fetch entries");

  const grouped = {};
  for (const row of data) {
    let walletStr = String(row.wallet).trim().replace(/\u0000/g, "");

    try {
      const pubkey = new PublicKey(walletStr); // confirm it's valid
      walletStr = pubkey.toBase58(); // normalize
    } catch {
      console.warn("Invalid wallet skipped:", row.wallet);
      continue;
    }

    if (!grouped[walletStr]) grouped[walletStr] = { totalEntries: 0, totalTix: 0 };
    grouped[walletStr].totalEntries += row.entries || 0;
    grouped[walletStr].totalTix += row.tix_amount || 0;
  }

  const eligible = [];
  for (const wallet of Object.keys(grouped)) {
    try {
      const pubkey = new PublicKey(wallet);
      let heldRatio = 1;

      if (grouped[wallet].totalTix > 0) {
        const ata = await getAssociatedTokenAddress(TIX_MINT, pubkey, false);

        // --- FIX: don’t throw if ATA doesn't exist; treat balance as 0 ---
        const ataInfo = await connection.getAccountInfo(ata);

        let currentBalance = 0;
        if (ataInfo) {
          const account = await getAccount(connection, ata);
          currentBalance = Number(account.amount) / 1e6; // TIX has 6 decimals
        }
        heldRatio = currentBalance / grouped[wallet].totalTix;
        // clamp to [0,1] just in case
        heldRatio = Math.max(0, Math.min(heldRatio, 1));
      }

      const effective = Math.min(
        Math.floor(grouped[wallet].totalEntries * heldRatio),
        grouped[wallet].totalEntries
      );

      const count = Math.floor(effective);
      if (count > 0) eligible.push(...Array(count).fill(wallet));
    } catch (err) {
      console.warn(`Failed to process wallet ${wallet}`, err.message);
    }
  }

  return eligible;
}

function pickRandomWinner(pool) {
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

// -------------------- LOG --------------------
async function logDraw(winner, amount, entries, signature) {
  const { error } = await supabase.from("draws").insert([{
    draw_type: "moon",
    draw_date: new Date().toISOString(),
    winner,
    jackpot_sol: amount / LAMPORTS_PER_SOL,
    entries,
    tx_signature: signature,
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

  const winnerAmount = Math.floor(available * 0.8);
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

  await logDraw(winner, available, entries, sig);
  console.log("Draw complete.");
}

runDraw().catch(console.error);
