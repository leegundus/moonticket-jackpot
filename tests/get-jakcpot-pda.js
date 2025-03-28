const anchor = require("@coral-xyz/anchor");
const { PublicKey } = anchor.web3;

describe("Get Jackpot PDA", () => {
  // Update with your actual program ID from the latest deploy
  const PROGRAM_ID = new PublicKey("GmyMFG4QWhh2YK4bjy489eBzf9Hzf3BLZ1sFfZnoeWpB");

  it("Prints the Jackpot PDA", async () => {
    const [jackpotPda, bump] = await PublicKey.findProgramAddressSync(
      [Buffer.from("jackpot")],
      PROGRAM_ID
    );

    console.log("Jackpot PDA:", jackpotPda.toBase58());
    console.log("Jackpot Bump:", bump);
  });
});
