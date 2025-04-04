const anchor = require("@coral-xyz/anchor");

process.env.ANCHOR_PROVIDER_URL = "https://api.devnet.solana.com"

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.MoonticketJackpot;

async function main() {
  const [jackpotPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("jackpot")],
    program.programId
  );

  const tx = await program.methods
    .initialize()
    .accounts({
      jackpot: jackpotPda,
      user: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Jackpot PDA initialized:", jackpotPda.toBase58());
  console.log("✅ Transaction signature:", tx);
}

main().catch((err) => {
  console.error("❌ Error initializing jackpot:", err);
});

