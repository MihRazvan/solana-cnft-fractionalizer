#!/bin/bash

# Kill any existing validator
pkill -f solana-test-validator

# Start the validator with required programs
solana-test-validator \
  --reset \
  --bpf-program BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY ./programs/bubblegum.so \
  --bpf-program noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmR ./programs/noop.so \
  --bpf-program cmprV1LGw39K9P6vzHrZJkxRhqhreZHAkBKMT4BJUzh ./programs/compression.so \
  --url https://api.mainnet-beta.solana.com \
  &

# Wait for validator to start
sleep 5

# Airdrop some SOL to your wallet
solana airdrop 100