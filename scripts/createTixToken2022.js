const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
  PublicKey,
} = require("@solana/web3.js");
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");
const fs = require("fs");
const os = require("os");
const path = require("path");

// === CONFIG ===
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const treasuryPath = path.join(os.homedir(), ".config/solana/treasury.json");
const treasuryKey = JSON.parse(fs.readFileSync(treasuryPath));
const payer = Keypair.fromSecretKey(new Uint8Array(treasuryKey));

(async () => {
  const decimals = 6;
  const totalSupply = BigInt(1_000_000_000_000_000_000); // 1 trillion with 6 decimals

  // Create the mint
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority
    payer.publicKey, // freeze authority
    decimals,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  console.log("Token-2022 Mint Created:", mint.toBase58());

  // Create ATA for treasury
  const treasuryATA = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
    true,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  console.log("Treasury ATA:", treasuryATA.address.toBase58());

  // Mint the full supply to the treasury
  const txSig = await mintTo(
    connection,
    payer,
    mint,
    treasuryATA.address,
    payer,
    totalSupply,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  console.log("Minted 1T $TIX:", txSig);
})();

