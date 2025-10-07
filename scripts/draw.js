/* eslint-disable no-console */
const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });

const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

const {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
} = require("@solana/spl-token");

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

// ---------- CONFIG ----------
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || process.env.RPC_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TIX_MINT = new PublicKey(process.env.TIX_MINT || process.env.NEXT_PUBLIC_TIX_MINT);
const OPS_WALLET = new PublicKey(process.env.OPS_WALLET); // NEW

// lookback window for entries when no prior draw exists
const DRAW_LOOKBACK_DAYS = Number(process.env.DRAW_LOOKBACK_DAYS || 7);

// how much of the treasury balance (in SOL) is reserved for jackpot payouts (what users see)
const JACKPOT_SNAPSHOT_PCT = Number(process.env.JACKPOT_SNAPSHOT_PCT || 0.80);

// leave as-is (TIX has 6 decimals)
const TOKEN_DECIMALS = 6;

// limit to these entry types (must be number-based)
const ELIGIBLE_ENTRY_TYPES = (process.env.ELIGIBLE_ENTRY_TYPES || "purchase,tweet,promo,prize,credit")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// PRIZE table for secondary prizes (in **human** TIX units). Jackpot handled separately.
const PRIZE_TABLE = [
  { tier: "4+MB", matches: 4, moonball: true,  tix: 500_000 },
  { tier: "4",    matches: 4, moonball: false, tix: 250_000 },
  { tier: "3+MB", matches: 3, moonball: true,  tix: 100_000 },
  { tier: "3",    matches: 3, moonball: false, tix: 50_000  },
  { tier: "2+MB", matches: 2, moonball: true,  tix: 20_000  },
  { tier: "1+MB", matches: 1, moonball: true,  tix: 15_000  },
  { tier: "0+MB", matches: 0, moonball: true,  tix: 10_000  },
];

// DRY RUN (simulate without moving funds)
const DRY_RUN = (() => {
  if ((process.argv || []).some(a => a === "--dry-run")) return true;
  return String(process.env.DRY_RUN || "0") === "1";
})();

// ---------- HELPERS ----------
function parseKeypair(secret) {
  if (!secret) throw new Error("Missing secret for keypair");

  // Case 1: JSON array (e.g. "[12,34,...]")
  try {
    const arr = JSON.parse(secret);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch (_) {
    // Case 2: base58 string; tolerate different module shapes (CJS, ESM, default)
    const m = require("bs58");
    const decodeFn =
      (m && typeof m.decode === "function" && m.decode) ||
      (m && m.default && typeof m.default.decode === "function" && m.default.decode) ||
      (typeof m === "function" && m) ||
      null;

    if (!decodeFn) {
      throw new Error("bs58 module not providing a decode function");
    }

    const bytes = decodeFn(secret);
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }
}

function pickWinningNumbers() {
  const pool = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const four = pool.slice(0, 4).sort((a, b) => a - b);
  const moon = crypto.randomInt(1, 11);
  return { four, moon };
}

function parseForcedDraw() {
  // CLI: --force="1,2,3,4|7"
  // ENV: DRAW_FORCE="1,2,3,4|7"
  const arg = process.argv.find((a) => a.startsWith("--force="));
  const raw = arg ? arg.split("=")[1] : (process.env.DRAW_FORCE || "").trim();
  if (!raw) return null;

  const [numsStr, moonStr] = raw.split("|");
  if (!numsStr || !moonStr) return null;

  const nums = numsStr.split(",").map((n) => Number(n.trim())).sort((a, b) => a - b);
  const moon = Number(moonStr.trim());

  if (
    nums.length === 4 &&
    nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 25) &&
    new Set(nums).size === 4 &&
    Number.isInteger(moon) && moon >= 1 && moon <= 10
  ) {
    return { four: nums, moon };
  }
  console.warn('Invalid DRAW_FORCE format. Expected "1,2,3,4|7" with 1–25 unique + moon 1–10.');
  return null;
}

function scoreTicket(entryNums, winNums) {
  const picked = [entryNums.num1, entryNums.num2, entryNums.num3, entryNums.num4].sort((a, b) => a - b);
  const w = winNums.four;
  const moonballMatch = entryNums.moonball === winNums.moon;
  let matches = 0, i = 0, j = 0;
  while (i < picked.length && j < w.length) {
    if (picked[i] === w[j]) { matches++; i++; j++; }
    else if (picked[i] < w[j]) i++;
    else j++;
  }
  return { matches, moonballMatch };
}

function findTier(matches, moonball) {
  for (const row of PRIZE_TABLE) {
    if (row.matches === matches && row.moonball === moonball) return row;
  }
  return null;
}

async function ensureAtaIx(connection, mint, ownerPubkey, payerKeypair) {
  const ata = await getAssociatedTokenAddress(mint, ownerPubkey, false);
  try {
    await getAccount(connection, ata);
    return { ata, ixs: [] };
  } catch {
    const ix = createAssociatedTokenAccountInstruction(
      payerKeypair.publicKey,
      ata,
      ownerPubkey,
      mint
    );
    return { ata, ixs: [ix] };
  }
}

// ---------- MAIN ----------
(async () => {
  if (!RPC_URL || !SUPABASE_URL || !SUPABASE_KEY || !TIX_MINT || !process.env.TREASURY_SECRET_KEY || !process.env.OPS_WALLET) {
    console.error("Missing env vars. Required: NEXT_PUBLIC_RPC_URL (or RPC_URL), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TIX_MINT, TREASURY_SECRET_KEY, OPS_WALLET");
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const TREASURY = parseKeypair(process.env.TREASURY_SECRET_KEY);
  const treasuryPub = TREASURY.publicKey;

  // 1) Determine window (use your draws.draw_date column)
  //    If DRY_RUN, use the 2nd-most-recent draw as cutoff so tests don't exclude existing entries.
  const needTwo = DRY_RUN ? 2 : 1;
  const { data: recentDraws, error: drawsErr } = await supabase
    .from("draws")
    .select("draw_date")
    .order("draw_date", { ascending: false })
    .limit(needTwo);

  if (drawsErr) {
    console.error("Supabase error reading draws:", drawsErr);
    process.exit(1);
  }

  const lastCutoff = DRY_RUN ? recentDraws?.[1]?.draw_date : recentDraws?.[0]?.draw_date;

  const windowStart = lastCutoff
    ? new Date(lastCutoff)
    : new Date(Date.now() - DRAW_LOOKBACK_DAYS * 24 * 3600 * 1000);
  const windowEnd = new Date();

  // 2) Winning numbers (forced or random)
  const forced = parseForcedDraw();
  const winning = forced || pickWinningNumbers();
  console.log("Winning numbers:", winning, forced ? "(FORCED)" : "");

  // 3) Snapshot treasury to decide pools
  let treasuryLamports = 0;
  try { treasuryLamports = await connection.getBalance(treasuryPub); }
  catch (e) { console.warn("Balance snapshot failed:", e.message); }
  const winnersPoolLamports = Math.floor(treasuryLamports * JACKPOT_SNAPSHOT_PCT); // 80%
  const opsPoolLamports = treasuryLamports - winnersPoolLamports;                  // 20%
  const jackpotSolSnapshot = Number((winnersPoolLamports / LAMPORTS_PER_SOL).toFixed(6)); // what UI displays

  // 4) Insert draw (USE windowEnd for draw_date to match scoring window)
  const { data: drawRow, error: drawErr } = await supabase
    .from("draws")
    .insert({
      draw_type: "moon",
      draw_date: windowEnd.toISOString(), // <-- aligned with windowEnd
      win_num1: winning.four[0],
      win_num2: winning.four[1],
      win_num3: winning.four[2],
      win_num4: winning.four[3],
      win_moonball: winning.moon,
      jackpot_sol: jackpotSolSnapshot,
    })
    .select("*")
    .single();

  if (drawErr) {
    console.error("Failed to insert draw:", drawErr);
    process.exit(1);
  }
  const drawId = drawRow.id;

  // 5) Load eligible entries
  let query = supabase
    .from("entries")
    .select("id,wallet,entry_type,num1,num2,num3,num4,moonball,created_at")
    .gte("created_at", windowStart.toISOString())
    .lte("created_at", windowEnd.toISOString())
    .not("num1", "is", null)
    .not("num2", "is", null)
    .not("num3", "is", null)
    .not("num4", "is", null)
    .not("moonball", "is", null);

  if (ELIGIBLE_ENTRY_TYPES.length) {
    query = query.in("entry_type", ELIGIBLE_ENTRY_TYPES);
  }

  const { data: entries, error: entErr } = await query;
  if (entErr) {
    console.error("Failed to load entries:", entErr);
    process.exit(1);
  }
  console.log(
    `Eligible entries: ${entries.length} (${windowStart.toISOString()} → ${windowEnd.toISOString()})`
  );

  // 6) Score tickets
  const jackpotWinners = [];
  const secondaryWinners = [];
  for (const e of entries) {
    if (![e.num1, e.num2, e.num3, e.num4, e.moonball].every(Number.isInteger)) continue;
    const s = scoreTicket(
      { num1: e.num1, num2: e.num2, num3: e.num3, num4: e.num4, moonball: e.moonball },
      { four: winning.four, moon: winning.moon }
    );
    if (s.matches === 4 && s.moonballMatch) {
      jackpotWinners.push({ entry: e, score: s });
    } else {
      const tier = findTier(s.matches, s.moonballMatch);
      if (tier) secondaryWinners.push({ entry: e, tier, score: s });
    }
  }

  console.log(`Jackpot winners: ${jackpotWinners.length}`);
  console.log(`Secondary winners: ${secondaryWinners.length}`);

  // 7) Pay TIX to secondary winners & record awards
  for (const { entry, tier, score } of secondaryWinners) {
    const payoutHuman = tier.tix;
    const payoutBase = BigInt(payoutHuman) * BigInt(10 ** TOKEN_DECIMALS);

    try {
      const winnerPub = new PublicKey(entry.wallet);
      const { ata: destAta, ixs: createDestAtaIxs } = await ensureAtaIx(connection, TIX_MINT, winnerPub, TREASURY);
      const treasuryAta = await getAssociatedTokenAddress(TIX_MINT, treasuryPub, false);

      let sig = "DRY_RUN_TIX";
      if (!DRY_RUN) {
        const tx = new Transaction();
        for (const ix of createDestAtaIxs) tx.add(ix);
        tx.add(createTransferInstruction(treasuryAta, destAta, treasuryPub, payoutBase));
        tx.feePayer = treasuryPub;
        sig = await sendAndConfirmTransaction(connection, tx, [TREASURY], { commitment: "confirmed" });
      }
      console.log(`Paid ${payoutHuman} TIX to ${entry.wallet} (tier ${tier.tier}) → ${sig}`);

      const { error: awardErr } = await supabase
        .from("prize_awards")
        .insert({
          draw_id: drawId,
          entry_id: entry.id,
          wallet: entry.wallet,
          tier: tier.tier,
          matches: score.matches,
          moonball_matched: score.moonballMatch,
          payout_tix: payoutBase.toString(), // store as string for bigints
          tx_sig: sig,
        });
      if (awardErr) console.error("Failed inserting prize_awards row:", awardErr);
    } catch (e) {
      console.error(`Payout failed for ${entry.wallet} (tier ${tier.tier}):`, e.message);
      // Record intent even on failure
      await supabase.from("prize_awards").insert({
        draw_id: drawId,
        entry_id: entry.id,
        wallet: entry.wallet,
        tier: tier.tier,
        matches: score.matches,
        moonball_matched: score.moonballMatch,
        payout_tix: (BigInt(payoutHuman) * BigInt(10 ** TOKEN_DECIMALS)).toString(),
        tx_sig: null,
      });
    }
  }

  // 8) JACKPOT: auto pay in SOL (80% to winners, then OPS sweep of what's left)
  if (jackpotWinners.length > 0 && winnersPoolLamports > 0) {
    const perWinnerLamports = Math.max(1, Math.floor(winnersPoolLamports / jackpotWinners.length));
    console.log(
      `Jackpot pool (80%): ${winnersPoolLamports} lamports (~${jackpotSolSnapshot} SOL); ` +
      `per winner: ${perWinnerLamports} lamports (~${(perWinnerLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL).`
    );

    // Winners
    for (const { entry, score } of jackpotWinners) {
      try {
        const winnerPub = new PublicKey(entry.wallet);
        let sig = "DRY_RUN_SOL_WIN";
        if (!DRY_RUN) {
          const tx = new Transaction().add(SystemProgram.transfer({
            fromPubkey: treasuryPub,
            toPubkey: winnerPub,
            lamports: perWinnerLamports,
          }));
          tx.feePayer = treasuryPub;
          sig = await sendAndConfirmTransaction(connection, tx, [TREASURY], { commitment: "confirmed" });
        }
        console.log(`Paid JACKPOT ${(perWinnerLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL to ${entry.wallet} → ${sig}`);

        await supabase.from("prize_awards").insert({
          draw_id: drawId,
          entry_id: entry.id,
          wallet: entry.wallet,
          tier: "JACKPOT",
          matches: score.matches,
          moonball_matched: score.moonballMatch,
          payout_tix: 0,       // keep schema compatibility
          tx_sig: sig,         // SOL payout signature (or DRY_RUN)
        });
      } catch (e) {
        console.error(`JACKPOT payout failed for ${entry.wallet}:`, e.message);
        await supabase.from("prize_awards").insert({
          draw_id: drawId,
          entry_id: entry.id,
          wallet: entry.wallet,
          tier: "JACKPOT",
          matches: score.matches,
          moonball_matched: score.moonballMatch,
          payout_tix: 0,
          tx_sig: null,
        });
      }
    }

    // ---------------- OPS SWEEP (send "whatever's left" minus a buffer) ----------------
    try {
      const MIN_BUFFER =
        Number(process.env.TREASURY_MIN_BUFFER_LAMPORTS || 1_500_000); // ~0.0015 SOL

      const latest1 = await connection.getBalance(treasuryPub);
      let opsAmount = Math.max(0, latest1 - MIN_BUFFER);

      const sendOps = async (amount) => {
        let sig = "DRY_RUN_SOL_OPS";
        if (!DRY_RUN && amount > 0) {
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: treasuryPub,
              toPubkey: OPS_WALLET,
              lamports: amount,
            })
          );
          tx.feePayer = treasuryPub;
          sig = await sendAndConfirmTransaction(connection, tx, [TREASURY], {
            commitment: "confirmed",
          });
        }
        return sig;
      };

      let finalSig = null;
      try {
        if (opsAmount > 0) finalSig = await sendOps(opsAmount);
      } catch (firstErr) {
        console.warn("OPS sweep retrying with larger buffer:", firstErr.message);
        const latest2 = await connection.getBalance(treasuryPub);
        const BIGGER_BUFFER = Math.max(MIN_BUFFER, 2_500_000); // ~0.0025 SOL
        opsAmount = Math.max(0, latest2 - BIGGER_BUFFER);
        if (opsAmount > 0) finalSig = await sendOps(opsAmount);
      }

      if (opsAmount > 0) {
        console.log(
          `Sent OPS sweep → ${(opsAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL (${opsAmount} lamports). Sig: ${
            finalSig || "DRY_RUN_SOL_OPS"
          }`
        );
      } else {
        console.log("OPS sweep skipped: nothing left after buffer; treasury rolls over.");
      }
    } catch (e) {
      console.error("OPS sweep failed:", e.message);
    }
    // -------------------------------------------------------------------
  } else if (jackpotWinners.length > 0) {
    console.warn("Jackpot winners detected but pool is zero—recording winners without payout.");
    for (const { entry, score } of jackpotWinners) {
      await supabase.from("prize_awards").insert({
        draw_id: drawId,
        entry_id: entry.id,
        wallet: entry.wallet,
        tier: "JACKPOT",
        matches: score.matches,
        moonball_matched: score.moonballMatch,
        payout_tix: 0,
        tx_sig: null,
      });
    }
  } else {
    console.log("No jackpot winners → no SOL moved; treasury rolls over.");
  }

  console.log("Draw complete.", DRY_RUN ? "(DRY RUN)" : "");
  process.exit(0);
})().catch((e) => {
  console.error("Fatal error in draw:", e);
  process.exit(1);
});

