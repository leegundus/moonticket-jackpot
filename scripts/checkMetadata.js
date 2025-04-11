const {
  Connection,
  PublicKey,
  clusterApiUrl,
} = require('@solana/web3.js');

// Fix: manually define the Metaplex Token Metadata program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s' // Metaplex Metadata Program
);

// === CONFIG ===
const MINT_ADDRESS = 'CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM'; // your token mint

(async () => {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const mint = new PublicKey(MINT_ADDRESS);

  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  console.log('Metadata PDA:', metadataPDA.toBase58());
  const accountInfo = await connection.getAccountInfo(metadataPDA);

  if (accountInfo === null) {
    console.log('No metadata found for token.');
  } else {
    console.log('Metadata account exists at:', metadataPDA.toBase58());
    console.log('Raw metadata account data (base64):', accountInfo.data.toString('base64'));
  }
})();
