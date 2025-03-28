#!/bin/bash

SEED="pole bike tell segment image cram thrive use circle acoustic south drink"
PASSPHRASE="5n0wFl@k31"
KEYFILE="$HOME/.config/solana/treasury.json"
PHRASE_FILE="temp-phrase.txt"

# Write seed to temporary file
echo "$SEED" > "$PHRASE_FILE"

for i in {16..200}; do
  echo "Trying derivation path: key=$i/0"

  solana-keygen recover --phrase "$PHRASE_FILE" \
    --outfile "$KEYFILE" \
    --force \
    --derivation-path "m/44'/501'/$i'/0'" \
    <<< "$PASSPHRASE"

  solana config set --keypair "$KEYFILE" > /dev/null
  ADDRESS=$(solana address)

  echo "Recovered address: $ADDRESS"

  if [ "$ADDRESS" = "AwQEfwAXLyionsg2fKLBadvGLr1QmeHWF7ctQ3CD4cCq" ]; then
    echo "FOUND TREASURY WALLET at key=$i/0"
    break
  fi

  echo "Not matched. Continuing..."
done

rm "$PHRASE_FILE"
