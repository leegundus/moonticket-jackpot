const { Connection, clusterApiUrl, PublicKey, Keypair } = require('@solana/web3.js');
const { Metaplex, keypairIdentity } = require('@metaplex-foundation/js');
const fs = require('fs');
const os = require('os');
const path = require('path');

// === CONFIG ===
const MINT_ADDRESS = 'F3tGNp3GN8qefseSBAkXHB8z1sqTMWJSJreSYZSgrgbR';
const METADATA_URI = 'https://bafybeigmgptn3zdy3hdc6z42ky3kdi57evlsr6ddkyltb7ljnkfyd7rcry.ipfs.w3s.link/tix-token.json';
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
    mintAuthority: treasury,          // <- This prevents creating a new mint
  });

  console.log('Metadata forcibly created for token:');
  console.log('Mint:', nft.address.toBase58());
  console.log('Tx Signature:', response.signature);
})();
