"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor = __importStar(require("@coral-xyz/anchor"));
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const umi_bundle_defaults_1 = require("@metaplex-foundation/umi-bundle-defaults");
const mpl_bubblegum_1 = require("@metaplex-foundation/mpl-bubblegum");
const umi_1 = require("@metaplex-foundation/umi");
const chai_1 = require("chai");
describe("cnft_fractionalizer", () => {
    // Configure the client to use the local cluster
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace
        .CnftFractionalizer;
    // Test state
    let umi;
    let shareMint;
    let vaultPDA;
    let vaultBump;
    let uniqueId;
    beforeEach(async () => {
        try {
            // Initialize UMI
            const wallet = provider.wallet;
            umi = (0, umi_bundle_defaults_1.createUmi)(provider.connection.rpcEndpoint)
                .use((0, mpl_bubblegum_1.mplBubblegum)());
            const walletSigner = (0, umi_1.createSignerFromKeypair)(umi, {
                publicKey: (0, umi_1.publicKey)(wallet.publicKey.toBase58()),
                secretKey: wallet.payer.secretKey,
            });
            umi = umi.use((0, umi_1.signerIdentity)(walletSigner));
            // Generate test keypairs
            shareMint = web3_js_1.Keypair.generate();
            uniqueId = new anchor.BN(Math.floor(Math.random() * 1000));
            // For PDA derivation, use 8 bytes
            uniqueId.toArrayLike(Buffer, 'le', 8);
            // Find the vault PDA with shorter seeds
            const [vaultAddress, bump] = web3_js_1.PublicKey.findProgramAddressSync([
                Buffer.from("vault"),
                provider.wallet.publicKey.toBuffer(),
                uniqueId.toArrayLike(Buffer, 'le', 8) // Use 8 bytes for u64
            ], program.programId);
            vaultPDA = vaultAddress;
            vaultBump = bump;
            console.log("Test setup completed:");
            console.log("Vault PDA:", vaultPDA.toString());
            console.log("Share Mint:", shareMint.publicKey.toString());
            console.log("Unique ID:", uniqueId.toString());
        }
        catch (error) {
            console.error("Setup failed:", error);
            throw error;
        }
    });
    it("Can initialize vault", async () => {
        try {
            // Airdrop some SOL if needed
            const balance = await provider.connection.getBalance(provider.wallet.publicKey);
            if (balance < 1000000000) {
                const sig = await provider.connection.requestAirdrop(provider.wallet.publicKey, 1000000000);
                await provider.connection.confirmTransaction(sig);
            }
            const tx = await program.methods
                .initializeVault(vaultBump, new anchor.BN(1000000000), uniqueId)
                .accounts({
                initializer: provider.wallet.publicKey,
                vault: vaultPDA,
                shareMint: shareMint.publicKey,
                systemProgram: web3_js_1.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
                .signers([shareMint])
                .rpc();
            console.log("Vault initialization signature:", tx);
            // Fetch and verify the vault data
            const vaultData = await program.account.vault.fetch(vaultPDA);
            console.log("Vault data:", vaultData);
            (0, chai_1.expect)(vaultData.owner.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
            (0, chai_1.expect)(vaultData.shareMint.toBase58()).to.equal(shareMint.publicKey.toBase58());
            (0, chai_1.expect)(vaultData.isLocked).to.be.false;
            (0, chai_1.expect)(vaultData.bump).to.equal(vaultBump);
            (0, chai_1.expect)(vaultData.uniqueId.eq(uniqueId)).to.be.true;
            console.log("✅ Vault initialization test passed");
        }
        catch (error) {
            console.error("❌ Vault initialization test failed:", error);
            throw error;
        }
    });
});
//# sourceMappingURL=cnft_fractionalizer.js.map