const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl,
  SystemProgram,
} = require('@solana/web3.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const borsh = require('borsh');

// === CONFIG ===
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const mint = new PublicKey('CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM');
const uri = 'ipfs://bafybeibpimsx4wq7yngc6kjrowox2ynf5obrbs7xg6brsgiuecaxheyraq/tix-token.json';
const name = 'Moonticket';
const symbol = 'TIX';

// === Load Treasury Wallet ===
const treasuryPath = path.join(os.homedir(), '.config/solana/treasury.json');
const secret = JSON.parse(fs.readFileSync(treasuryPath));
const payer = Keypair.fromSecretKey(new Uint8Array(secret));

// === Borsh Layout ===
class DataV2 {
  constructor(args) {
    Object.assign(this, args);
  }
}
class CreateMetadataAccountArgsV3 {
  instruction = 33;
  constructor(args) {
    Object.assign(this, args);
  }
}

const METADATA_SCHEMA = new Map([
  [CreateMetadataAccountArgsV3, {
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
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  // === Derive Metadata PDA ===
  const [metadataPDA] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );

  // === Prepare Data
  const metadataData = new DataV2({
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  });

  const args = new CreateMetadataAccountArgsV3({
    data: metadataData,
    isMutable: 1,
    collectionDetails: null,
  });

  const serializedData = borsh.serialize(METADATA_SCHEMA, args);
  const instructionData = Buffer.from(serializedData);

  const keys = [
    { pubkey: metadataPDA, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // mint authority
    { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // payer
    { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // update authority
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const tx = new Transaction().add({
    keys,
    programId: METADATA_PROGRAM_ID,
    data: instructionData,
  });

  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log('Metadata created successfully!');
  console.log('Tx:', sig);
})();

