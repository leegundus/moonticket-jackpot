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

// === CONSTANTS ===
const SOL_PRICE_USD = 180;
const TIX_PRICE_USD = 0.00001;
const DECIMALS = 9;

// === CLI ARGS ===
const BUYER_ADDRESS = process.argv[2];
const SOL_AMOUNT = parseFloat(process.argv[3]);

if (!BUYER_ADDRESS || isNaN(SOL_AMOUNT)) {
  console.error("Usage: node buyTix.js <buyer_address> <sol_amount>");
  process.exit(1);
}

// === CONFIG ===
const TREASURY_KEYPAIR = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(os.homedir() + "/.config/solana/treasury.json")
    )
  )
);
const TREASURY_WALLET = TREASURY_KEYPAIR.publicKey;

const FOUNDER_WALLET = new PublicKey("nJmonUssRvbp85Nvdd9Bnxgh86Hf6BtKfu49RdcoYE9"); // Your founder wallet

const TOKEN_MINT = new PublicKey("CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM"); // Your $TIX token mint

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// === CALCULATIONS ===
const FOUNDER_FEE = SOL_AMOUNT * 0.01;
const TRANSFER_TO_TREASURY = SOL_AMOUNT - FOUNDER_FEE;

const TIX_AMOUNT = Math.floor((SOL_AMOUNT * SOL_PRICE_USD) / TIX_PRICE_USD);
const TIX_AMOUNT_RAW = TIX_AMOUNT * 10 ** DECIMALS;

// === EXECUTE ===
(async () => {
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
      { commitment: "confirmed", preflightCommitment: "confirmed", lastValidBlockHeight: latestBlockhash.lastValidBlockHeight }
    );

    // 2. Transfer remaining SOL to treasury (noop — already in treasury)

    // 3. Transfer $TIX tokens to buyer
    console.log(`Sending ${TIX_AMOUNT.toLocaleString()} $TIX to buyer...`);
    const buyerPublicKey = new PublicKey(BUYER_ADDRESS);

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

    const latestTokenBlockhash = await connection.getLatestBlockhash();

    const tx = new Transaction({
      recentBlockhash: latestTokenBlockhash.blockhash,
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
      { commitment: "confirmed", preflightCommitment: "confirmed", lastValidBlockHeight: latestTokenBlockhash.lastValidBlockHeight }
    );

    console.log("Transfer successful:", sig);
  } catch (err) {
    console.error("Transaction failed:", err.message);
  }
})();
