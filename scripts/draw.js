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
async function fetchEligibleWeighted() {
  // 1) Find last draw time
  const { data: draws, error: drawError } = await supabase
    .from("draws")
    .select("draw_date")
    .eq("draw_type", "moon")
    .order("draw_date", { ascending: false })
    .limit(1);

  if (drawError) throw new Error("Failed to fetch last draw");

  const lastDrawTime = draws?.[0]?.draw_date
    ? new Date(draws[0].draw_date)
    : new Date(0);

  console.log("Last Draw:", lastDrawTime.toISOString());

  // 2) Grab entries strictly after last draw
  const { data: rows, error } = await supabase
    .from("entries")
    .select("wallet, entries, created_at")
    .gte("created_at", lastDrawTime.toISOString());

  if (error) throw new Error("Failed to fetch entries");

  // 3) Normalize & build weight list
  //    We do a weighted pick without expanding into a huge array.
  const weights = []; // [{ wallet, weight }]
  const byWallet = {}; // aggregate entries per wallet (optional but cleaner)
  for (const r of rows || []) {
    const raw = (r.wallet ?? "").toString().trim().replace(/\u0000/g, "");
    let base58;
    try {
      base58 = new PublicKey(raw).toBase58(); // normalize & validate
    } catch {
      console.warn("Skipping invalid wallet in entries:", r.wallet);
      continue;
    }
    const w = Math.floor(Number(r.entries || 0));
    if (!Number.isFinite(w) || w <= 0) continue;

    byWallet[base58] = (byWallet[base58] || 0) + w;
  }

  for (const [wallet, weight] of Object.entries(byWallet)) {
    if (weight > 0) weights.push({ wallet, weight });
  }

  const totalWeight = weights.reduce((s, x) => s + x.weight, 0);
  if (totalWeight <= 0) return { winner: null, winnerWeight: 0, totalWeight: 0 };

  // 4) Weighted random pick
  let r = Math.floor(Math.random() * totalWeight);
  let winner = null;
  let winnerWeight = 0;
  for (const { wallet, weight } of weights) {
    if (r < weight) {
      winner = wallet;
      winnerWeight = weight;
      break;
    }
    r -= weight;
  }

  return { winner, winnerWeight, totalWeight };
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
  console.log("Building eligible pool (weighted)...");
  const { winner, winnerWeight, totalWeight } = await fetchEligibleWeighted();

  if (!winner) {
    console.log("No eligible entries");
    throw new Error("No eligible entries");
  }

  console.log(`Winner: ${winner} (tickets: ${winnerWeight} of ${totalWeight})`);

  // Treasury payout
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

  // NOTE: This will only work if `payer` can sign for TREASURY (i.e., is the same key).
  // If TREASURY is a different key, include it as a signer too.
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log("Transaction sent:", sig);

  await logDraw(winner, available, winnerWeight, sig);
  console.log("Draw complete.");
}

runDraw().catch(console.error);
