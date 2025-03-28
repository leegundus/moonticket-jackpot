const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");

// === CONFIG ===
const NETWORK = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("GmyMFG4QwHh2YK4bjy489eBzf9Hzf3BLZ1sFfznoeWpB");

// === MANUAL PROVIDER SETUP ===
const connection = new Connection(NETWORK, "confirmed");
const wallet = anchor.Wallet.local();
const provider = new anchor.AnchorProvider(connection, wallet, {
  preflightCommitment: "confirmed",
});
anchor.setProvider(provider);

// === MANUAL INSTRUCTION DISCRIMINATOR ===
// Discriminator for initialize() from your IDL (already compiled)
const initializeDiscriminator = Buffer.from([
  175, 175, 109, 31, 13, 152, 155, 237,
]);

async function initJackpot() {
  const [jackpotPda, bump] = await PublicKey.findProgramAddressSync(
    [Buffer.from("jackpot")],
    PROGRAM_ID
  );

  console.log("Jackpot PDA:", jackpotPda.toBase58());

  const instruction = new anchor.web3.TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: jackpotPda, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initializeDiscriminator, // Hardcoded discriminator for 'initialize'
  });

  const tx = new anchor.web3.Transaction().add(instruction);
  const sig = await provider.sendAndConfirm(tx, []);
  console.log("Initialize TX:", sig);
}

initJackpot().catch(console.error);

