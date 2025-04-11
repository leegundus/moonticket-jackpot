const { Connection, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { Metadata } = require('@metaplex-foundation/mpl-token-metadata');

const connection = new Connection(clusterApiUrl('devnet'));

const mint = new PublicKey('CnDaNe3EpAgu2R2aK49nhnH9byf9Y3TWpm689uxavMbM');

(async () => {
  const metadataPDA = await Metadata.getPDA(mint);

  try {
    const metadataAccount = await Metadata.load(connection, metadataPDA);
    console.log('Metadata found!');
    console.log('Name:', metadataAccount.data.data.name);
    console.log('Symbol:', metadataAccount.data.data.symbol);
    console.log('URI:', metadataAccount.data.data.uri);
  } catch (err) {
    console.log('No metadata found for token.');
  }
})();
