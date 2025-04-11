const { Connection, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);
const TOKEN_MINT = new PublicKey('CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM');

(async () => {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      TOKEN_MINT.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  console.log('Metadata PDA:', metadataPDA.toBase58());

  const account = await connection.getAccountInfo(metadataPDA);

  if (!account) {
    console.log('No metadata account found at PDA.');
  } else {
    console.log('Metadata account exists!');
    console.log('Raw data (base58):', bs58.encode(account.data));
  }
})();
