#!/bin/bash

mkdir -p programs

# Download Bubblegum program
curl -L https://github.com/metaplex-foundation/mpl-bubblegum/releases/latest/download/bubblegum.so -o programs/bubblegum.so

# Download SPL Account Compression program
curl -L https://github.com/solana-labs/solana-program-library/releases/latest/download/spl_account_compression.so -o programs/compression.so

# Download SPL Noop program
curl -L https://github.com/solana-labs/solana-program-library/releases/latest/download/spl_noop.so -o programs/noop.so

chmod +x programs/*.so