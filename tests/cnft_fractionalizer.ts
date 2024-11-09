import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { CnftFractionalizer } from "../target/types/cnft_fractionalizer";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import {
  createTree,
  mintV1,
  getAssetWithProof,
  TokenStandard,
  TokenProgramVersion,
} from "@metaplex-foundation/mpl-bubblegum";
import { none } from "@metaplex-foundation/umi";

describe("cnft_fractionalizer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .CnftFractionalizer as Program<CnftFractionalizer>;

  // Initialize Umi
  const umi = createUmi(provider.connection)
    .use(mplBubblegum());

  // Test keypairs
  let merkleTree: Keypair;
  let shareMint: Keypair;
  let vaultPDA: PublicKey;
  let vaultBump: number;
  let uniqueId: anchor.BN;
  let testNftOwner: Keypair;

  // Bubblegum test data
  let treeAuthority: PublicKey;
  let assetId: PublicKey;

  beforeEach(async () => {
    // Generate new keypairs for each test
    merkleTree = Keypair.generate();
    shareMint = Keypair.generate();
    testNftOwner = Keypair.generate();
    uniqueId = new anchor.BN(Math.floor(Math.random() * 1000000));

    // Find the vault PDA
    const [vaultAddress, bump] = await PublicKey.findProgramAddress(
      [
        Buffer.from("vault"),
        provider.wallet.publicKey.toBuffer(),
        uniqueId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    vaultPDA = vaultAddress;
    vaultBump = bump;

    // Find tree authority PDA
    [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.publicKey.toBuffer()],
      program.programId
    );

    console.log("Test setup completed:");
    console.log("Merkle Tree:", merkleTree.publicKey.toString());
    console.log("Tree Authority:", treeAuthority.toString());
    console.log("Vault PDA:", vaultPDA.toString());
    console.log("Share Mint:", shareMint.publicKey.toString());
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
});