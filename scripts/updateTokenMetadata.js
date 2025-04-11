const { Connection, clusterApiUrl, Keypair, PublicKey } = require('@solana/web3.js');
const { Metaplex, keypairIdentity } = require('@metaplex-foundation/js');
const fs = require('fs');
const os = require('os');
const path = require('path');

// === CONFIG ===
const MINT_ADDRESS = 'CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM';
const METADATA_URI = 'ipfs://bafybeibpimsx4wq7yngc6kjrowox2ynf5obrbs7xg6brsgiuecaxheyraq/tix-token.json';
const TOKEN_NAME = 'Moonticket';
const TOKEN_SYMBOL = 'TIX';

// === Load Treasury Wallet ===
const treasuryPath = path.join(os.homedir(), '.config/solana/treasury.json');
const treasuryKey = JSON.parse(fs.readFileSync(treasuryPath));
const treasury = Keypair.fromSecretKey(new Uint8Array(treasuryKey));

(async () => {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const metaplex = Metaplex.make(connection).use(keypairIdentity(treasury));

  const mint = new PublicKey(MINT_ADDRESS);

  const { nft, response } = await metaplex.nfts().create({
    uri: METADATA_URI,
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    sellerFeeBasisPoints: 0,
    isMutable: true,
    updateAuthority: treasury,
    mintAddress: mint,
  });

  console.log('Metadata successfully attached!');
  console.log('Mint:', nft.address.toBase58());
  console.log('Tx Signature:', response.signature);
})();
