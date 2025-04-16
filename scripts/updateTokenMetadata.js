const { Connection, clusterApiUrl, PublicKey, Keypair } = require('@solana/web3.js');
const { Metaplex, keypairIdentity } = require('@metaplex-foundation/js');
const fs = require('fs');
const os = require('os');
const path = require('path');

// === CONFIG ===
const MINT_ADDRESS = new PublicKey('8CVzxjxLB2aHVEbWRqzHtdkNRotMnNFef6epzrsGNB3a');
const METADATA_URI = 'https://bafkreifdzb6yz42x2unjg5miu37n737hwk2ros5rbu4qii5nw64kaenwju.ipfs.w3s.link';
const TOKEN_NAME = 'Moonticket';
const TOKEN_SYMBOL = 'TIX';

// === Load Treasury Wallet ===
const treasuryPath = path.join(os.homedir(), '.config/solana/treasury.json');
const treasuryKey = JSON.parse(fs.readFileSync(treasuryPath));
const treasury = Keypair.fromSecretKey(new Uint8Array(treasuryKey));

(async () => {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const metaplex = Metaplex.make(connection).use(keypairIdentity(treasury));

  console.log('Fetching current metadata...');
  const nft = await metaplex.nfts().findByMint({ mintAddress: MINT_ADDRESS });

  console.log('Updating metadata...');
  const { response } = await metaplex.nfts().update({
    nftOrSft: nft,
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    uri: METADATA_URI,
    updateAuthority: treasury,
  });

  console.log('Metadata updated successfully!');
  console.log('Tx Signature:', response.signature);
})();
