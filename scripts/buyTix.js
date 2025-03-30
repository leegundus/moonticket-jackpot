const {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction
} = require("@solana/web3.js");

const {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID
} = require("@solana/spl-token");

const fs = require("fs");
const os = require("os");

// === CONFIG ===
const SOL_PRICE_USD = 180;
const TIX_PRICE_USD = 0.00001;
const DECIMALS = 9;

const TREASURY_KEYPAIR = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(os.homedir() + "/.config/solana/treasury.json")
    )
  )
);
const TREASURY_WALLET = TREASURY_KEYPAIR.publicKey;
const FOUNDER_WALLET = new PublicKey("nJmonUssRvbp85Nvdd9Bnxgh86Hf6BtKfu49RdcoYE9");
const TOKEN_MINT = new PublicKey("CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM");

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// === MAIN FUNCTION ===
async function buyTix(walletAddress, solAmount) {
  const FOUNDER_FEE = solAmount * 0.01;
  const TIX_AMOUNT = Math.floor((solAmount * SOL_PRICE_USD) / TIX_PRICE_USD);
  const TIX_AMOUNT_RAW = TIX_AMOUNT * 10 ** DECIMALS;

  const buyerPublicKey = new PublicKey(walletAddress);

  try {
    const latestBlockhash = await connection.getLatestBlockhash();

    // 1. Transfer 1% SOL fee to founder
    console.log("Transferring 1% SOL fee to founder...");
    const feeTx = new Transaction({
      recentBlockhash: latestBlockhash.blockhash,
      feePayer: TREASURY_WALLET
    }).add(
      SystemProgram.transfer({
        fromPubkey: TREASURY_WALLET,
        toPubkey: FOUNDER_WALLET,
        lamports: Math.floor(FOUNDER_FEE * LAMPORTS_PER_SOL),
      })
    );

    await sendAndConfirmTransaction(
      connection,
      feeTx,
      [TREASURY_KEYPAIR],
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }
    );

    // 2. Transfer $TIX tokens to buyer
    console.log(`Sending ${TIX_AMOUNT.toLocaleString()} $TIX to buyer...`);

    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      TREASURY_KEYPAIR,
      TOKEN_MINT,
      TREASURY_WALLET
    );

    const toTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      TREASURY_KEYPAIR,
      TOKEN_MINT,
      buyerPublicKey
    );

    const tokenBlockhash = await connection.getLatestBlockhash();

    const tx = new Transaction({
      recentBlockhash: tokenBlockhash.blockhash,
      feePayer: TREASURY_WALLET
    }).add(
      createTransferInstruction(
        fromTokenAccount.address,
        toTokenAccount.address,
        TREASURY_KEYPAIR.publicKey,
        TIX_AMOUNT_RAW,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [TREASURY_KEYPAIR],
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
        lastValidBlockHeight: tokenBlockhash.lastValidBlockHeight
      }
    );

    console.log("Transfer successful:", sig);

    return {
      success: true,
      signature: sig,
      tixAmount: TIX_AMOUNT
    };
  } catch (err) {
    console.error("Transaction failed:", err.message);
    throw new Error("Transaction failed: " + err.message);
  }
}

// === SAFE CLI SUPPORT ===
if (require.main === module) {
  (async () => {
    const [buyerAddress, solAmountRaw] = process.argv.slice(2);
    const solAmount = parseFloat(solAmountRaw);

    if (!buyerAddress || isNaN(solAmount)) {
      console.error("Usage: node buyTix.js <buyer_address> <sol_amount>");
      process.exit(1);
    }

    try {
      const result = await buyTix(buyerAddress, solAmount);
      console.log("CLI BuyTix Result:", result);
    } catch (err) {
      console.error("CLI Error:", err.message);
    }
  })();
}
// === EXPORT FUNCTION FOR NEXT.JS ===
module.exports = buyTix;
