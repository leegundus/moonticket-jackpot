const {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} = require('@solana/web3.js');
const {
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createMintToInstruction,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID: TOKEN_METADATA_PROGRAM_ID,
} = require('@metaplex-foundation/mpl-token-metadata');

const fs = require('fs');
const path = require('path');
const os = require('os');

// === CONFIG ===
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
const treasuryPath = path.join(os.homedir(), '.config/solana/treasury.json');
const treasury = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(treasuryPath))));

const NFTS = [
  {
    name: 'Gold Moonticket',
    symbol: 'GOLD',
    uri: 'ipfs://bafybeibpimsx4wq7yngc6kjrowox2ynf5obrbs7xg6brsgiuecaxheyraq/tix-gold-nft.json',
    supply: 1000,
  },
  {
    name: 'Silver Moonticket',
    symbol: 'SILVER',
    uri: 'ipfs://bafybeibpimsx4wq7yngc6kjrowox2ynf5obrbs7xg6brsgiuecaxheyraq/tix-silver-nft.json',
    supply: 5000,
  },
  {
    name: 'Bronze Moonticket',
    symbol: 'BRONZE',
    uri: 'ipfs://bafybeibpimsx4wq7yngc6kjrowox2ynf5obrbs7xg6brsgiuecaxheyraq/tix-bronze-nft.json',
    supply: 10000,
  },
];

(async () => {
  for (const { name, symbol, uri, supply } of NFTS) {
    const mint = Keypair.generate();

    const lamports = await getMinimumBalanceForRentExemptMint(connection);

    const ata = await getAssociatedTokenAddress(mint.publicKey, treasury.publicKey);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: treasury.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mint.publicKey,
        0,
        treasury.publicKey,
        treasury.publicKey
      ),
      createAssociatedTokenAccountInstruction(
        treasury.publicKey,
        ata,
        treasury.publicKey,
        mint.publicKey
      ),
      createMintToInstruction(
        mint.publicKey,
        ata,
        treasury.publicKey,
        supply
      )
    );

    const metadataPDA = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.publicKey.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )[0];

    const metadataIx = createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPDA,
        mint: mint.publicKey,
        mintAuthority: treasury.publicKey,
        payer: treasury.publicKey,
        updateAuthority: treasury.publicKey,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name,
            symbol,
            uri,
            sellerFeeBasisPoints: 500, // 5% royalty
            creators: null,
            collection: null,
            uses: null,
          },
          isMutable: true,
          collectionDetails: null,
        },
      }
    );

    tx.add(metadataIx);

    const sig = await sendAndConfirmTransaction(connection, tx, [treasury, mint]);
    console.log(`${name} NFT minted! Mint address: ${mint.publicKey.toBase58()}`);
    console.log(`Tx: https://explorer.solana.com/tx/${sig}?cluster=devnet\n`);
  }
})();
