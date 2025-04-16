const { Connection, clusterApiUrl, Keypair, PublicKey } = require("@solana/web3.js");
const { keypairIdentity, Metaplex } = require("@metaplex-foundation/js");
const fs = require("fs");
const path = require("path");
const os = require("os");

// === CONFIG ===
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

const treasuryPath = path.join(os.homedir(), ".config/solana/treasury.json");
const treasuryKey = JSON.parse(fs.readFileSync(treasuryPath));
const treasuryWallet = Keypair.fromSecretKey(new Uint8Array(treasuryKey));

const mintAddress = new PublicKey("DMY5kebhsjoQaMXkkzhd8Q2FR5VBBHfehLozHFgPFCzX");
const metadataUri = "https://bafkreihqxaswnvch2xl7xzjpohgmngzul3uc4te4totqj5s6kvxohivy4a.ipfs.w3s.link";

// === INIT METAPLEX ===
const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(treasuryWallet));

// === SET METADATA ===
(async () => {
  try {
    const { nft } = await metaplex.nfts().create({
      name: "Moonticket",
      symbol: "TIX",
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
      isMutable: true,
      maxSupply: 0,
      mintAuthority: treasuryWallet,
      updateAuthority: treasuryWallet,
      mint: mintAddress,
    });

    console.log("Metadata set for:", nft.address.toBase58());
  } catch (err) {
    console.error("Metadata set failed:", err.message);
  }
})();
