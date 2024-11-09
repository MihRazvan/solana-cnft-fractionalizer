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
import {
  none,
  publicKey,
  Umi,
  createSignerFromKeypair,
  generateSigner,
  signerIdentity,
  PublicKey as UmiPublicKey,
  Signer,
  Context,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { expect } from 'chai';

describe("cnft_fractionalizer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .CnftFractionalizer as Program<CnftFractionalizer>;

  // Initialize Umi with a keypair identity
  let umi: Umi;

  // Test keypairs for Anchor program
  let shareMint: Keypair;
  let vaultPDA: PublicKey;
  let vaultBump: number;
  let uniqueId: anchor.BN;

  // Umi signers and accounts
  let merkleTreeSigner: Signer;
  let testNftOwner: Signer;
  let treeAuthority: PublicKey;
  let assetId: UmiPublicKey;

  beforeEach(async () => {
    // Create UMI instance with identity
    const wallet = provider.wallet as anchor.Wallet;
    umi = createUmi(provider.connection.rpcEndpoint)
      .use(mplBubblegum());

    const walletSigner = createSignerFromKeypair(umi, {
      publicKey: publicKey(wallet.publicKey.toBase58()),
      secretKey: wallet.payer.secretKey,
    });
    umi = umi.use(signerIdentity(walletSigner));

    // Generate new keypairs for Anchor program
    shareMint = Keypair.generate();
    uniqueId = new anchor.BN(Math.floor(Math.random() * 1000000));

    // Generate Umi signers
    merkleTreeSigner = generateSigner(umi);
    testNftOwner = generateSigner(umi);

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
      [Buffer.from(merkleTreeSigner.publicKey)],
      program.programId
    );

    console.log("Test setup completed:");
    console.log("Merkle Tree:", merkleTreeSigner.publicKey);
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

      expect(vaultData.owner.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
      expect(vaultData.shareMint.toBase58()).to.equal(shareMint.publicKey.toBase58());
      expect(vaultData.isLocked).to.be.false;
      expect(vaultData.bump).to.equal(vaultBump);
      expect(vaultData.uniqueId.eq(uniqueId)).to.be.true;

      console.log("✅ Test passed successfully");
    } catch (error) {
      console.error("❌ Test failed:", error);
      throw error;
    }
  });

  it("Can create tree and mint test cNFT", async () => {
    try {
      // Initialize context for transactions
      const context = {
        payer: umi.payer,
        rpc: umi.rpc,
        transactions: umi.transactions,
      } satisfies Pick<Context, "payer" | "rpc" | "transactions">;

      // Create tree
      const treeCreation = await createTree(umi, {
        merkleTree: merkleTreeSigner,
        maxDepth: 14,
        maxBufferSize: 64,
        public: true,
      });

      const latestBlockhash = await umi.rpc.getLatestBlockhash();
      const treeTx = await treeCreation.send(context);
      await umi.rpc.confirmTransaction(treeTx, {
        strategy: {
          type: 'blockhash',
          blockhash: latestBlockhash.blockhash.toString(),
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        },
      });
      console.log("Tree created successfully");

      // Mint test cNFT
      const mintCreation = await mintV1(umi, {
        leafOwner: testNftOwner.publicKey,
        merkleTree: merkleTreeSigner.publicKey,
        metadata: {
          name: "Test cNFT",
          symbol: "TEST",
          uri: "https://test.uri/metadata.json",
          sellerFeeBasisPoints: 0,
          collection: none(),
          creators: [{
            address: publicKey(provider.wallet.publicKey.toBase58()),
            verified: false,
            share: 100,
          }],
        },
      });

      const newBlockhash = await umi.rpc.getLatestBlockhash();
      const mintTx = await mintCreation.send(context);
      await umi.rpc.confirmTransaction(mintTx, {
        strategy: {
          type: 'blockhash',
          blockhash: newBlockhash.blockhash.toString(),
          lastValidBlockHeight: newBlockhash.lastValidBlockHeight
        },
      });
      console.log("cNFT minted successfully");

      // Get asset data and verify
      const asset = await getAssetWithProof(umi, assetId);
      expect(asset).to.not.be.null;
      expect(asset.leafOwner).to.equal(testNftOwner.publicKey);

      console.log("✅ Tree creation and minting test passed successfully");
    } catch (error) {
      console.error("❌ Test failed:", error);
      throw error;
    }
  });
});