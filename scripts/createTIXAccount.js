const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey, Transaction } = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const fs = require("fs");
const os = require("os");

const NETWORK = "https://api.devnet.solana.com";
const connection = new Connection(NETWORK, "confirmed");

// Replace with your actual TIX mint address
const TIX_MINT = new PublicKey("3H9wieuWWTqon5E6Zi83FNwcy9injPTtJMpZhnEK9T7");

// Load payer (must match recipient)
const payer = anchor.web3.Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(os.homedir() + "/.config/solana/user1.json", "utf8")))
);

const PHANTOM_USER = payer.publicKey;

(async () => {
  try {
    const ata = await getAssociatedTokenAddress(
      TIX_MINT,
      PHANTOM_USER,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        PHANTOM_USER,
        TIX_MINT,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );

    const sig = await anchor.web3.sendAndConfirmTransaction(connection, tx, [payer]);
    console.log("✅ ATA created:", ata.toBase58());
    console.log("Signature:", sig);
  } catch (err) {
    console.error("❌ Failed to create ATA:", err.message);
  }
})();

