const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl,
  SystemProgram,
} = require('@solana/web3.js');
const {
  createInitializeMintInstruction,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createMintToInstruction,
} = require('@solana/spl-token');
const fs = require('fs');
const os = require('os');
const path = require('path');
const borsh = require('borsh');

// === CONFIG ===
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

const TOKEN_NAME = 'Moonticket';
const TOKEN_SYMBOL = 'TIX';
const METADATA_URI = 'https://bafybeiel6hf3glnmal5l6h2kpkd7coh2t54dcguan6ue6iuv3nfa5uuz74.ipfs.w3s.link/tix-token.json';

// === Load Treasury Wallet ===
const treasuryPath = path.join(os.homedir(), '.config/solana/treasury.json');
const treasuryKey = JSON.parse(fs.readFileSync(treasuryPath));
const payer = Keypair.fromSecretKey(new Uint8Array(treasuryKey));

// === Borsh Layout for Metadata ===
class DataV2 {
  constructor(fields) {
    Object.assign(this, fields);
  }
}
class CreateMetadataArgs {
  instruction = 33; // CreateMetadataAccountV3
  constructor(fields) {
    Object.assign(this, fields);
  }
}
const METADATA_SCHEMA = new Map([
  [CreateMetadataArgs, {
    kind: 'struct',
    fields: [
      ['instruction', 'u8'],
      ['data', DataV2],
      ['isMutable', 'u8'],
      ['collectionDetails', { kind: 'option', type: 'u8' }],
    ],
  }],
  [DataV2, {
    kind: 'struct',
    fields: [
      ['name', 'string'],
      ['symbol', 'string'],
      ['uri', 'string'],
      ['sellerFeeBasisPoints', 'u16'],
      ['creators', { kind: 'option', type: ['struct', []] }],
      ['collection', { kind: 'option', type: ['struct', []] }],
      ['uses', { kind: 'option', type: ['struct', []] }],
    ],
  }],
]);

(async () => {
  // === Step 1: Mint New Token
  const mint = Keypair.generate();
  const lamports = await getMinimumBalanceForRentExemptMint(connection);
  const ata = await getAssociatedTokenAddress(mint.publicKey, payer.publicKey);

  const mintTx = new Transaction()
    .add(SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }))
    .add(createInitializeMintInstruction(
      mint.publicKey,
      9, // decimals
      payer.publicKey, // mint authority
      payer.publicKey  // freeze authority
    ))
    .add(createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      mint.publicKey
    ))
    .add(createMintToInstruction(
      mint.publicKey,
      ata,
      payer.publicKey,
      1_000_000_000_000 // mint some tokens to yourself
    ));

  const mintSig = await sendAndConfirmTransaction(connection, mintTx, [payer, mint]);
  console.log('Mint created:', mint.publicKey.toBase58());
  console.log('Tx:', mintSig);

  // === Step 2: Attach Metadata
  const [metadataPDA] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.publicKey.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );

  const metadata = new DataV2({
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    uri: METADATA_URI,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  });

  const args = new CreateMetadataArgs({
    data: metadata,
    isMutable: 1,
    collectionDetails: null,
  });

  const data = Buffer.from(borsh.serialize(METADATA_SCHEMA, args));

  const ix = {
    keys: [
      { pubkey: metadataPDA, isSigner: false, isWritable: true },
      { pubkey: mint.publicKey, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // mint authority
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // payer
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // update authority
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: METADATA_PROGRAM_ID,
    data,
  };

  const metaTx = new Transaction().add(ix);
  const metaSig = await sendAndConfirmTransaction(connection, metaTx, [payer]);

  console.log('Metadata attached!');
  console.log('Metadata Tx:', metaSig);
})();

