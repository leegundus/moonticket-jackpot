const {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Keypair
} = require("@solana/web3.js");
const fs = require("fs");
const os = require("os");
require("dotenv").config();

// ---------------- CONFIG ----------------
const NETWORK = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("GmyMFG4QwHh2YK4bjy489eBzf9Hzf3BLZ1sFfznoeWpB");
const JACKPOT_PDA = new PublicKey("3z32sBrwkKD7BUdPQJJ7FV5Mu9hHxK1YFgFPzMKdFuSk");

const treasuryKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(os.homedir() + "/.config/solana/treasury.json")))
);

// ---------------- MANUAL DISCRIMINATOR (for `initialize`) ----------------
const initializeDiscriminator = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

// ---------------- INIT FUNCTION ----------------
async function initJackpot() {
  const connection = new Connection(NETWORK, "confirmed");

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: JACKPOT_PDA, isSigner: false, isWritable: true },
      { pubkey: treasuryKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: initializeDiscriminator
  });

  const tx = new Transaction().add(instruction);
  const sig = await sendAndConfirmTransaction(connection, tx, [treasuryKeypair]);

  console.log("Initialize Jackpot TX Signature:", sig);
}

initJackpot().catch(console.error);
