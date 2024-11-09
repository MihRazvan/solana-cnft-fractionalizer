#!/bin/bash

# Get directory of the script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROGRAM_DIR="$SCRIPT_DIR/../programs"

# Create programs directory if it doesn't exist
mkdir -p "$PROGRAM_DIR"

echo "Downloading program binaries..."

# Download Bubblegum program
echo "Downloading Bubblegum program..."
curl -L https://github.com/metaplex-foundation/mpl-bubblegum/releases/latest/download/bubblegum.so -o "$PROGRAM_DIR/bubblegum.so"

# Download SPL Account Compression program
echo "Downloading Account Compression program..."
curl -L https://github.com/solana-labs/solana-program-library/releases/download/account-compression-v0.2.0/spl_account_compression.so -o "$PROGRAM_DIR/compression.so"

# Download SPL Noop program
echo "Downloading Noop program..."
curl -L https://github.com/solana-labs/solana-program-library/releases/download/account-compression-v0.2.0/spl_noop.so -o "$PROGRAM_DIR/noop.so"

# Make the programs executable
chmod +x "$PROGRAM_DIR"/*.so

echo "Program binaries downloaded successfully to $PROGRAM_DIR"