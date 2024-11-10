#!/bin/bash

# Kill any existing validator
pkill -f solana-test-validator

# Get directory of the script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROGRAM_DIR="$SCRIPT_DIR/../programs"

# Check if the programs exist
if [ ! -f "$PROGRAM_DIR/bubblegum.so" ] || [ ! -f "$PROGRAM_DIR/compression.so" ] || [ ! -f "$PROGRAM_DIR/noop.so" ]; then
    echo "Program files missing. Running download script..."
    "$SCRIPT_DIR/download-programs.sh"
fi

# Start the validator with required programs
solana-test-validator \
  --reset \
  --bpf-program BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY "$PROGRAM_DIR/bubblegum.so" \
  --bpf-program noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmR "$PROGRAM_DIR/noop.so" \
  --bpf-program cmprV1LGw39K9P6vzHrZJkxRhqhreZHAkBKMT4BJUzh "$PROGRAM_DIR/compression.so" \
  --rpc-port 8899 \
  &

# Wait for validator to start
sleep 10

# Verify our wallet has SOL
CURRENT_BALANCE=$(solana balance)
if [ "$CURRENT_BALANCE" = "0 SOL" ]; then
    echo "Airdropping SOL..."
    solana airdrop 100
fi

echo "Validator started successfully!"
echo "RPC URL: http://localhost:8899"
echo "Programs deployed:"
echo "Bubblegum: BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"
echo "Noop: noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmR"
echo "Compression: cmprV1LGw39K9P6vzHrZJkxRhqhreZHAkBKMT4BJUzh"
