const { PublicKey } = require('@solana/web3.js');

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);

const mint = new PublicKey('CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM');

const [metadataPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from('metadata'),
    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
    mint.toBuffer()
  ],
  TOKEN_METADATA_PROGRAM_ID
);

console.log('Metadata PDA:', metadataPda.toBase58());
