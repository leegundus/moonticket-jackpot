const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl,
} = require('@solana/web3.js');

const {
  createCreateMetadataAccountV3Instruction
} = require('@metaplex-foundation/mpl-token-metadata/dist/src/instructions');

const fs = require('fs');
const os = require('os');
const path = require('path');

// === CONFIG ===
const mint = new PublicKey('CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM');
const uri = 'ipfs://bafybeibpimsx4wq7yngc6kjrowox2ynf5obrbs7xg6brsgiuecaxheyraq/tix-token.json';
const name = 'Moonticket';
const symbol = 'TIX';

// === Load Treasury Wallet ===
const treasuryPath = path.join(os.homedir(), '.config/solana/treasury.json');
const secret = JSON.parse(fs.readFileSync(treasuryPath));
const payer = Keypair.fromSecretKey(new Uint8Array(secret));

// === Manual PDA Derivation ===
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

(async () => {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const [metadataPDA] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );

  const data = {
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  };

  const ix = createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataPDA,
      mint,
      mintAuthority: payer.publicKey,
      payer: payer.publicKey,
      updateAuthority: payer.publicKey,
    },
    {
      createMetadataAccountArgsV3: {
        data,
        isMutable: true,
        collectionDetails: null,
      },
    }
  );

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);

  console.log('Metadata successfully created!');
  console.log('Tx Signature:', sig);
})();
