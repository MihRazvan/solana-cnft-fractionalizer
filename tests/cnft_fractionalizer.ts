import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  Transaction,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { CnftFractionalizer } from "../target/types/cnft_fractionalizer";
import assert from "assert";

describe("cnft_fractionalizer", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CnftFractionalizer as Program<CnftFractionalizer>;

  // Store keypairs and PDAs
  let shareMint: Keypair;
  let vaultPDA: PublicKey;
  let vaultBump: number;
  let uniqueId: anchor.BN;

  beforeEach(async () => {
    shareMint = Keypair.generate();
    // Create a unique identifier for each test
    uniqueId = new anchor.BN(Math.floor(Math.random() * 1000000));

    // Find the vault PDA using provider's wallet and unique id
    const [vaultAddress, bump] = await PublicKey.findProgramAddress(
      [
        Buffer.from("vault"),
        provider.wallet.publicKey.toBuffer(),
        uniqueId.toArrayLike(Buffer, "le", 8), // Convert to little-endian bytes
      ],
      program.programId
    );
    vaultPDA = vaultAddress;
    vaultBump = bump;

    console.log("Generated new test accounts");
    console.log("Vault PDA:", vaultPDA.toString());
    console.log("Share mint:", shareMint.publicKey.toString());
    console.log("Wallet:", provider.wallet.publicKey.toString());
    console.log("Unique ID:", uniqueId.toString());
  });

  it("Can initialize vault", async () => {
    try {
      const tx = await program.methods
        .initializeVault(vaultBump, new anchor.BN(1000000000), uniqueId)
        .accounts({
          initializer: provider.wallet.publicKey,
          vault: vaultPDA,
          shareMint: shareMint.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([shareMint])
        .rpc();

      console.log("Transaction signature:", tx);

      const vaultData = await program.account.vault.fetch(vaultPDA);
      console.log("Vault data:", vaultData);

      assert.ok(vaultData.owner.equals(provider.wallet.publicKey));
      assert.ok(vaultData.shareMint.equals(shareMint.publicKey));
      assert.strictEqual(vaultData.isLocked, false);
      assert.strictEqual(vaultData.bump, vaultBump);
      assert.ok(vaultData.uniqueId.eq(uniqueId));

      console.log("✅ Test passed successfully");
    } catch (error) {
      console.error("❌ Test failed:", error);
      throw error;
    }
  });

  it("Can deposit cNFT and receive fractional tokens", async () => {
    try {
      // First initialize the vault
      await program.methods
        .initializeVault(vaultBump, new anchor.BN(1000000000), uniqueId)
        .accounts({
          initializer: provider.wallet.publicKey,
          vault: vaultPDA,
          shareMint: shareMint.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([shareMint])
        .rpc();

      console.log("Vault initialized successfully");

      // Create token account
      const depositorTokenAccount = await getAssociatedTokenAddress(
        shareMint.publicKey,
        provider.wallet.publicKey
      );

      console.log("Creating token account:", depositorTokenAccount.toString());

      const createAtaIx = createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        depositorTokenAccount,
        provider.wallet.publicKey,
        shareMint.publicKey
      );

      const tx = new Transaction().add(createAtaIx);
      await provider.sendAndConfirm(tx);

      console.log("Token account created");

      // Mock cNFT data
      const mockRoot = Array(32).fill(1);
      const mockDataHash = Array(32).fill(2);
      const mockCreatorHash = Array(32).fill(3);

      const depositTx = await program.methods
        .depositCnft(
          mockRoot,
          mockDataHash,
          mockCreatorHash,
          new anchor.BN(123456789),
          1
        )
        .accounts({
          depositor: provider.wallet.publicKey,
          vault: vaultPDA,
          shareMint: shareMint.publicKey,
          depositorTokenAccount: depositorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("Deposit transaction signature:", depositTx);

      // Verify the vault is locked
      const vaultData = await program.account.vault.fetch(vaultPDA);
      assert.strictEqual(vaultData.isLocked, true);

      // Verify token balance
      const tokenBalance = await provider.connection.getTokenAccountBalance(
        depositorTokenAccount
      );
      console.log("Final token balance:", tokenBalance.value.amount);
      assert.strictEqual(
        tokenBalance.value.amount,
        "1000000000",
        "Should have received 1000000000 fractional tokens"
      );

      console.log("✅ Deposit test passed successfully");
    } catch (error) {
      console.error("❌ Deposit test failed:", error);
      throw error;
    }
  });
});