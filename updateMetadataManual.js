const {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl,
  SystemProgram,
  Keypair,
} = require('@solana/web3.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const borsh = require('borsh');

// === CONFIG ===
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const MINT_ADDRESS = new PublicKey('F3tGNp3GN8qefseSBAkXHB8z1sqTMWJSJreSYZSgrgbR');
const NEW_METADATA_URI = 'https://bafkreicaz37o5satupdhrrohhi7myq4ksprb4y7dv57x7ypv2vt5w4a4qu.ipfs.w3s.link';
const TOKEN_NAME = 'Moonticket';
const TOKEN_SYMBOL = 'TIX';

// === Load Treasury Wallet ===
const treasuryPath = path.join(os.homedir(), '.config/solana/treasury.json');
const secret = JSON.parse(fs.readFileSync(treasuryPath));
const payer = Keypair.fromSecretKey(new Uint8Array(secret));

// === Borsh Layout for UpdateMetadataAccountV2 ===
class DataV2 {
  constructor(fields) {
    Object.assign(this, fields);
  }
}
class UpdateMetadataAccountArgsV2 {
  instruction = 15; // <-- Correct instruction for UpdateMetadataAccountV2
  constructor(fields) {
    Object.assign(this, fields);
  }
}

const METADATA_SCHEMA = new Map([
  [UpdateMetadataAccountArgsV2, {
    kind: 'struct',
    fields: [
      ['instruction', 'u8'],
      ['data', { kind: 'option', type: DataV2 }],
      ['updateAuthority', { kind: 'option', type: 'pubkey' }],
      ['primarySaleHappened', { kind: 'option', type: 'u8' }],
      ['isMutable', { kind: 'option', type: 'u8' }],
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

  const [metadataPDA] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      MINT_ADDRESS.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );

  const metadata = new DataV2({
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    uri: NEW_METADATA_URI,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  });

  const args = new UpdateMetadataAccountArgsV2({
    data: metadata ? metadata : null,
    updateAuthority: null,
    primarySaleHappened: null,
    isMutable: null,
  });

  const data = Buffer.from(borsh.serialize(METADATA_SCHEMA, args));

  const ix = {
    keys: [
      { pubkey: metadataPDA, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    ],
    programId: METADATA_PROGRAM_ID,
    data,
  };

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);

  console.log('Metadata updated successfully!');
  console.log('Tx Signature:', sig);
})();
