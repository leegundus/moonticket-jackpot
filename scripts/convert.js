const bs58 = require('bs58');
const fs = require('fs');
const os = require('os');

// Read the CLI wallet keypair file
const keyArray = JSON.parse(fs.readFileSync(os.homedir() + '/.config/solana/user2.json'));

// Convert Uint8Array to Base58
const base58Key = bs58.default.encode(Buffer.from(keyArray));

console.log('Base58 Private Key:', base58Key);
