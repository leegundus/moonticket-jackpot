const {
  Connection,
  Keypair,
  clusterApiUrl,
  PublicKey,
} = require('@solana/web3.js');
const {
  createMintWithExtension,
  ExtensionType,
  TYPE_SIZE,
  LENGTH_SIZE,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
  TransferFeeConfig,
} = require('@solana/spl-token');
const fs = require('fs');
const os = require('os');

// Load treasury keypair
const treasuryPath = os.homedir() + '/.config/solana/treasury.json';
const treasurySecret = JSON.parse(fs.readFileSync(treasuryPath));
const treasury = Keypair.fromSecretKey(new Uint8Array(treasurySecret));

// Setup connection and token config
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
const mint = Keypair.generate();
const decimals = 9;

// Transfer fee config: 1% fee (100 basis points), no max fee
const feeBasisPoints = 100;
const maxFee = BigInt(0);

(async () => {
  console.log('Creating token with transfer fee extension...');

  await createMintWithExtension(
    connection,
    treasury, // payer
    mint,     // mint keypair
    treasury.publicKey, // mint authority
    decimals,
    treasury.publicKey, // freeze authority
    TOKEN_2022_PROGRAM_ID,
    [
      {
        type: ExtensionType.TransferFeeConfig,
        value: {
          transferFeeConfigAuthority: treasury.publicKey,
          withdrawWithheldAuthority: treasury.publicKey,
          feeBasisPoints: feeBasisPoints,
          maximumFee: maxFee,
        },
      },
    ]
  );

  console.log('✅ Token-2022 Mint Created!');
  console.log('Mint Address:', mint.publicKey.toBase58());
})();
