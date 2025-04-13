const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { deserializeUnchecked } = require('borsh');

// === CONFIG ===
const MINT_ADDRESS = new PublicKey('8e9Mqnczw7MHjdjYaRe3tppbXgRdT6bqTyR3n8b4C4Ek');
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// === BORSH SCHEMA FOR METADATA ===
class Data {
  constructor(args) {
    this.name = args.name;
    this.symbol = args.symbol;
    this.uri = args.uri;
    this.sellerFeeBasisPoints = args.sellerFeeBasisPoints;
    this.creators = args.creators;
  }
}

class Metadata {
  constructor(args) {
    this.key = args.key;
    this.updateAuthority = args.updateAuthority;
    this.mint = args.mint;
    this.data = args.data;
    this.primarySaleHappened = args.primarySaleHappened;
    this.isMutable = args.isMutable;
  }
}

const METADATA_SCHEMA = new Map([
  [Metadata, {
    kind: 'struct',
    fields: [
      ['key', 'u8'],
      ['updateAuthority', [32]],
      ['mint', [32]],
      ['data', Data],
      ['primarySaleHappened', 'u8'],
      ['isMutable', 'u8'],
    ],
  }],
  [Data, {
    kind: 'struct',
    fields: [
      ['name', 'string'],
      ['symbol', 'string'],
      ['uri', 'string'],
      ['sellerFeeBasisPoints', 'u16'],
      ['creators', { kind: 'option', type: 'string' }],
    ],
  }],
]);

(async () => {
  const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

  const [metadataPDA] = await PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBytes(),
      MINT_ADDRESS.toBytes(),
    ],
    METADATA_PROGRAM_ID
  );

  const accountInfo = await connection.getAccountInfo(metadataPDA);
  if (!accountInfo) {
    console.error('Metadata account not found.');
    return;
  }

  const metadata = deserializeUnchecked(METADATA_SCHEMA, Metadata, accountInfo.data);

  console.log('--- On-chain Metadata ---');
  console.log('Name:', metadata.data.name);
  console.log('Symbol:', metadata.data.symbol);
  console.log('URI:', metadata.data.uri);
})();
