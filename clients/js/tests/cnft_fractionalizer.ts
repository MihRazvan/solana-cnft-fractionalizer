import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { CnftFractionalizer } from "../target/types/cnft_fractionalizer";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplBubblegum,
  createTree,
  mintV1,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  Umi,
  generateSigner,
  signerIdentity,
  none,
  publicKey as umiPublicKey,
} from "@metaplex-foundation/umi";
import { expect } from "chai";

// Increase Jest timeout to 30 seconds
jest.setTimeout(30000);

describe("cnft_fractionalizer", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .CnftFractionalizer as Program<CnftFractionalizer>;

  // Test state
  let umi: Umi;
  let merkleTree: ReturnType<typeof generateSigner>;
  let shareMint: ReturnType<typeof generateSigner>;
  let vaultPDA: anchor.web3.PublicKey;
  let vaultBump: number;
  let uniqueId: anchor.BN;
  let leafOwner: ReturnType<typeof generateSigner>;

  beforeEach(async () => {
    // Add logging to track execution
    console.log("Starting beforeEach hook...");

    try {
      // Check if validator is running
      console.log("Attempting to get the latest blockhash...");
      const blockhash = await provider.connection.getLatestBlockhash();
      console.log("Successfully retrieved latest blockhash:", blockhash);
    } catch (e) {
      console.error(
        "Unable to connect to the validator. Please ensure it is running."
      );
      throw e; // Let the test fail naturally
    }

    // Log environment setup
    console.log("Provider URL:", provider.connection.rpcEndpoint);
    console.log("Wallet path:", process.env.ANCHOR_WALLET);
    console.log("Program ID:", program.programId.toString());

    // Initialize UMI
    const wallet = provider.wallet as anchor.Wallet;
    umi = createUmi(provider.connection.rpcEndpoint).use(mplBubblegum());

    // Create a Umi signer from the wallet's secret key
    const walletUmiSigner = generateSigner(
      umi,
      Uint8Array.from(wallet.payer.secretKey)
    );
    umi.use(signerIdentity(walletUmiSigner));

    // Create merkle tree
    merkleTree = generateSigner(umi);
    console.log("Creating Merkle Tree...");

    const treeIx = await createTree(umi, {
      merkleTree: merkleTree,
      maxDepth: 14,
      maxBufferSize: 64,
      public: false,
    });
    await treeIx.sendAndConfirm(umi);

    console.log("Merkle Tree created:", merkleTree.publicKey);

    // Generate test keypairs
    shareMint = generateSigner(umi);
    leafOwner = generateSigner(umi);
    uniqueId = new anchor.BN(Math.floor(Math.random() * 1000));

    // Convert Umi public keys to @solana/web3.js PublicKeys
    const shareMintPubkey = new anchor.web3.PublicKey(shareMint.publicKey);
    const merkleTreePubkey = new anchor.web3.PublicKey(merkleTree.publicKey);

    // Find the vault PDA
    const [vaultAddress, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        wallet.publicKey.toBuffer(),
        uniqueId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    vaultPDA = vaultAddress;
    vaultBump = bump;

    console.log("Vault PDA:", vaultPDA.toString());
    console.log("Share Mint:", shareMintPubkey.toString());
    console.log("Leaf Owner:", leafOwner.publicKey);
  });

  it("Can initialize vault", async () => {
    try {
      console.log("Starting 'Can initialize vault' test...");

      // Airdrop some SOL if needed
      const balance = await provider.connection.getBalance(
        provider.wallet.publicKey
      );
      console.log("Current balance:", balance);

      if (balance < 1000000000) {
        console.log("Requesting airdrop...");
        const sig = await provider.connection.requestAirdrop(
          provider.wallet.publicKey,
          1000000000
        );
        await provider.connection.confirmTransaction(sig);
        console.log("Airdrop successful");
      }

      // Convert Umi Keypair to @solana/web3.js Keypair
      const shareMintKeypair = anchor.web3.Keypair.fromSecretKey(
        Uint8Array.from(shareMint.secretKey)
      );

      // Initialize vault
      console.log("Initializing vault...");
      const tx = await program.methods
        .initializeVault(vaultBump, new anchor.BN(1000000000), uniqueId)
        .accounts({
          initializer: provider.wallet.publicKey,
          vault: vaultPDA,
          shareMint: shareMintKeypair.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([shareMintKeypair])
        .rpc();

      console.log("Vault initialization signature:", tx);

      // Fetch and verify the vault data
      const vaultData = await program.account.vault.fetch(vaultPDA);
      console.log("Vault data:", vaultData);

      expect(vaultData.owner.toBase58()).to.equal(
        provider.wallet.publicKey.toBase58()
      );
      expect(vaultData.shareMint.toBase58()).to.equal(
        shareMintKeypair.publicKey.toBase58()
      );
      expect(vaultData.isLocked).to.be.false;
      expect(vaultData.bump).to.equal(vaultBump);
      expect(vaultData.uniqueId.eq(uniqueId)).to.be.true;

      console.log("✅ Vault initialization test passed");
    } catch (error) {
      console.error("❌ Vault initialization test failed:", error);
      throw error;
    }
  });

  it("Can mint and deposit cNFT", async () => {
    try {
      console.log("Starting 'Can mint and deposit cNFT' test...");

      // Initialize vault first
      console.log("Initializing vault...");

      const shareMintKeypair = anchor.web3.Keypair.fromSecretKey(
        Uint8Array.from(shareMint.secretKey)
      );

      await program.methods
        .initializeVault(vaultBump, new anchor.BN(1000000000), uniqueId)
        .accounts({
          initializer: provider.wallet.publicKey,
          vault: vaultPDA,
          shareMint: shareMintKeypair.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([shareMintKeypair])
        .rpc();

      console.log("Vault initialized successfully");

      // Mint cNFT
      console.log("Minting cNFT...");
      const mintResult = await mintV1(umi, {
        merkleTree: merkleTree.publicKey, // Pass PublicKey
        leafOwner: leafOwner.publicKey,
        metadata: {
          name: "Test cNFT",
          symbol: "TCNFT",
          uri: "https://example.com/test.json",
          sellerFeeBasisPoints: 500,
          collection: none(),
          creators: [],
          editionNonce: null,
          primarySaleHappened: false,
          isMutable: true,
          tokenStandard: 0,
          uses: none(),
          tokenProgramVersion: 0,
        },
      }).sendAndConfirm(umi);

      console.log("cNFT mint signature:", mintResult.signature);

      // Retrieve required data for deposit_cnft instruction
      console.log("Retrieving Merkle tree root and leaf data...");
      const treeAccount = await umi.rpc.getAccount(merkleTree.publicKey);

      if (!treeAccount || !treeAccount.exists) {
        throw new Error("Merkle tree account does not exist");
      }

      const root = treeAccount.data.slice(72, 104); // Extract root from account data

      // Retrieve leaf data
      const assetId = await getAssetId(
        merkleTree.publicKey,
        mintResult.response!.leafIndex // Add '!' to assert 'response' is not undefined
      );
      const assetProof = await umi.rpc.getAssetProof(assetId);

      const nonce = assetProof.leaf!.nonce; // Add '!' to assert 'leaf' is not undefined
      const index = assetProof.leaf!.index;
      const dataHash = assetProof.leaf!.dataHash;
      const creatorHash = assetProof.leaf!.creatorHash;

      console.log("Leaf Data:");
      console.log("Nonce:", nonce.toString());
      console.log("Index:", index);
      console.log("Data Hash:", Buffer.from(dataHash).toString("hex"));
      console.log("Creator Hash:", Buffer.from(creatorHash).toString("hex"));

      // Define program IDs
      const bubblegumProgramId = new anchor.web3.PublicKey(
        "BGUmq1iAKiSxDC9RrjZr7wPq1PcDvF69PzS7JYvwgYAi"
      );
      const compressionProgramId = new anchor.web3.PublicKey(
        "cmtR1AnrEgy5HhxP9RJCnQqgrhBkTxfFU1eBRwTm2kT"
      );
      const logWrapperProgramId = new anchor.web3.PublicKey(
        "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
      );

      // Derive tree authority PDA
      const [treeAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
        [merkleTreePubkey.toBuffer()],
        bubblegumProgramId
      );

      // Create depositor's token account
      console.log("Creating depositor's token account...");
      const depositorTokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        provider.wallet.payer as anchor.web3.Signer, // payer
        shareMintKeypair.publicKey, // mint
        provider.wallet.publicKey // owner
      );

      console.log(
        "Depositor's token account:",
        depositorTokenAccount.address.toString()
      );

      // Call the deposit_cnft instruction
      console.log("Calling deposit_cnft instruction...");
      await program.methods
        .depositCnft(
          Array.from(root),
          Array.from(dataHash),
          Array.from(creatorHash),
          new anchor.BN(nonce),
          index
        )
        .accounts({
          depositor: provider.wallet.publicKey,
          vault: vaultPDA,
          shareMint: shareMintKeypair.publicKey,
          depositorTokenAccount: depositorTokenAccount.address,
          treeAuthority: treeAuthority,
          merkleTree: merkleTreePubkey,
          logWrapper: logWrapperProgramId,
          bubblegumProgram: bubblegumProgramId,
          compressionProgram: compressionProgramId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([])
        .rpc();

      console.log("✅ Deposit cNFT test passed");
    } catch (error) {
      console.error("❌ Deposit cNFT test failed:", error);
      throw error;
    }
  });

  // Helper function to get Asset ID
  const getAssetId = async (merkleTreePubkey: string, leafIndex: number) => {
    const [assetId] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("asset", "utf8"),
        new anchor.web3.PublicKey(merkleTreePubkey).toBuffer(),
        Buffer.from(leafIndex.toString(10), "utf8"),
      ],
      new anchor.web3.PublicKey("BGUmq1iAKiSxDC9RrjZr7wPq1PcDvF69PzS7JYvwgYAi") // Bubblegum Program ID
    );
    return assetId.toBase58();
  };
});
