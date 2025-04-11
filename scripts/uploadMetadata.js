const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const { NFTStorage, File } = require("nft.storage");

const { fetch, Request, Headers, Response } = require("undici");
global.fetch = fetch;
global.Request = Request;
global.Headers = Headers;
global.Response = Response;

const API_KEY = "ec4d6294.ae19ab678434432481921ac5bfe25358"; // replace this

const client = new NFTStorage({ token: API_KEY });

const filesToUpload = [
  "tix-coin.png",
  "gold-nft.png",
  "silver-nft.png",
  "bronze-nft.png",
  "tix-token.json",
  "tix-gold-nft.json",
  "tix-silver-nft.json",
  "tix-bronze-nft.json"
];

async function main() {
  const files = [];

  for (const filename of filesToUpload) {
    const filePath = path.join(__dirname, "..", "..", "moonticket-dapp-next", "public", filename);
    const content = await fs.promises.readFile(filePath);
    const type = mime.lookup(filename) || "application/octet-stream";
    files.push(new File([content], filename, { type }));
  }

  console.log("Uploading files to IPFS...");
  const cid = await client.storeDirectory(files);
  console.log("Upload complete.");
  console.log("Root CID:", cid);
  console.log(`View on IPFS: https://ipfs.io/ipfs/${cid}`);
}

main().catch(console.error);
