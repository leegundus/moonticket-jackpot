# Moonticket Jackpot - Solana Smart Contract

Welcome to the Moonticket Jackpot smart contract repository!

This program handles the weekly jackpot system for Moonticket, a community-driven $TIX token project on Solana.

## Overview
- Written in Anchor (Solana's Rust framework)
- Handles:
  - Weekly jackpot SOL accumulation
  - Winner selection (via off-chain draw script)
  - Payouts directly to winners
- Treasury and ops wallets hardcoded for full transparency
- No PDA holds funds — SOL flows directly to treasury
- Future NFT and burn-to-earn integrations planned

## Key Instructions
- **Buy $TIX**: Purchase $TIX tokens to earn jackpot entries
- **Draw Jackpot**: Off-chain script (draw.js) randomly selects and rewards winners
- **Withdraw**: Handles treasury and ops payouts automatically

## Deployment
- Solana Mainnet
- Built with Anchor Framework
- IDL available for frontend integration

## Project Links
- Website: [https://moonticket.io](https://moonticket.io)
- GitHub DApp Repo: [https://github.com/leegundus/moonticket-dapp-next](https://github.com/leegundus/moonticket-dapp-next)

---

# Security
- Private keys and sensitive configs are kept secure via `.env` files
- Smart contract verified on Solana Explorer

# License
MIT License

---
