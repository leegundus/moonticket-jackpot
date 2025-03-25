const assert = require('assert');
const anchor = require('@coral-xyz/anchor');
const { SystemProgram, PublicKey } = anchor.web3;
const program = anchor.workspace.MoonticketJackpot;

let jackpotPda, jackpotBump;
let userAccountPda;

describe('moonticket-jackpot', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const user1 = anchor.web3.Keypair.generate();
  const user2 = anchor.web3.Keypair.generate();

  it('Airdrop SOL to users', async () => {
    for (let user of [user1, user2]) {
      const sig = await provider.connection.requestAirdrop(user.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);
    }
  });

  it('Initialize Jackpot', async () => {
    [jackpotPda, jackpotBump] = await PublicKey.findProgramAddressSync(
      [Buffer.from('jackpot')],
      program.programId
    );

    await program.methods.initialize()
      .accounts({
        jackpot: jackpotPda,
        user: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const jackpotState = await program.account.jackpot.fetch(jackpotPda);
    console.log("Initialized Jackpot:", jackpotState);
  });

  it('Enter Jackpot (User 1)', async () => {
    [userAccountPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from('user'), user1.publicKey.toBuffer()],
      program.programId
    );

     await program.methods.enterJackpot(new anchor.BN(100))
      .accounts({
        jackpot: jackpotPda,
        userAccount: userAccountPda,
        user: user1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user1])
      .rpc();

   let [backupUserAccountPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from('user'), user2.publicKey.toBuffer()],
      program.programId
    );

 try { 
    await program.methods.enterJackpot(new anchor.BN(100))
      .accounts({
        jackpot: jackpotPda,
        userAccount: backupUserAccountPda,
        user: user2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user2])
      .rpc(); 

      console.log("Backup user account initialized");
    } catch (e) {
      console.log("Backup user account may already exist");
    }

    const userAccount = await program.account.userAccount.fetch(userAccountPda);
    console.log("User1 Entry:", userAccount);
  });

  it('Executes Moon Draw (with 25% hold rule)', async () => {
    const winner = user1.publicKey;
    const backup = user2.publicKey;

    const founderKey = new anchor.web3.PublicKey("FN1cuAr7FM4iYyNKF7kswTeoCASjAibLnmWHUN9m197e");
    const treasuryKey = new anchor.web3.PublicKey("AwQEfwAXLyionsg2fKLBadvGLr1QmeHWF7ctQ3CD4cCq");

    [userAccountPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from('user'), winner.toBuffer()],
      program.programId
    );

    const [backupUserAccountPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from("user"), backup.toBuffer()],
      program.programId
    );

    await program.methods.executeMoonDraw(winner, backup)
      .accounts({
        jackpot: jackpotPda,
        founder: founderKey,
        treasury: treasuryKey,
        user: winner,
        userAccount: userAccountPda,
        backup: backup,
        backupUserAccount: backupUserAccountPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const jackpot = await program.account.jackpot.fetch(jackpotPda);
    console.log("Moon Draw complete. Weekly entries:", jackpot.totalWeeklyEntries.toNumber());
    assert.equal(jackpot.totalWeeklyEntries.toNumber(), 0);
  });

  it('Executes Mega Moon Draw (with 25% check & fallback)', async () => {
    const winner = user1.publicKey;
    const backup = user2.publicKey;

    const founderKey = new anchor.web3.PublicKey("FN1cuAr7FM4iYyNKF7kswTeoCASjAibLnmWHUN9m197e");
    const treasuryKey = new anchor.web3.PublicKey("AwQEfwAXLyionsg2fKLBadvGLr1QmeHWF7ctQ3CD4cCq");

    [userAccountPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from('user'), winner.toBuffer()],
      program.programId
    );

    const [backupUserAccountPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from("user"), backup.toBuffer()],
      program.programId
    );

// Airdrop prize pool to jackpot
    await provider.connection.requestAirdrop(jackpotPda, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise((res) => setTimeout(res, 1000));

    // Airdrop to all recipients to avoid rent errors
    for (let pubkey of [winner, backup, founderKey, treasuryKey]) {
      await provider.connection.requestAirdrop(pubkey, 1 * anchor.web3.LAMPORTS_PER_SOL);
      await new Promise((res) => setTimeout(res, 500));
    }

    const tx = await program.methods.executeMegaMoonDraw(winner, backup)
      .accounts({
        jackpot: jackpotPda,
        userAccount: userAccountPda,
        backup: backup,
        backupUserAccount: backupUserAccountPda,
        winner,
        treasury: treasuryKey,
        founder: founderKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([])
      .rpc();

    console.log("Mega Moon Draw Signature:", tx);

    const updated = await program.account.jackpot.fetch(jackpotPda);
    console.log("Monthly Entries After:", updated.totalMonthlyEntries.toNumber());
    assert.equal(updated.totalMonthlyEntries.toNumber(), 0);
  });
});

