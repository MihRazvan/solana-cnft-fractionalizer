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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
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
    let merkleTree;
    let shareMint;
    let vaultPDA;
    let vaultBump;
    let uniqueId;
    let leafOwner;
    beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            // Initialize UMI
            const wallet = provider.wallet;
            umi = (0, umi_bundle_defaults_1.createUmi)(provider.connection.rpcEndpoint);
            const walletSigner = (0, umi_1.createSignerFromKeypair)(umi, {
                publicKey: (0, umi_1.publicKey)(wallet.publicKey.toBase58()),
                secretKey: wallet.payer.secretKey,
            });
            umi = umi.use((0, umi_1.signerIdentity)(walletSigner));
            // Create merkle tree
            merkleTree = (0, umi_1.generateSigner)(umi);
            const builder = yield (0, mpl_bubblegum_1.createTree)(umi, {
                merkleTree,
                maxDepth: 14,
                maxBufferSize: 64,
            });
            yield builder.sendAndConfirm(umi);
            // Generate test keypairs
            shareMint = web3_js_1.Keypair.generate();
            leafOwner = web3_js_1.Keypair.generate();
            uniqueId = new anchor.BN(Math.floor(Math.random() * 1000));
            // Find the vault PDA
            const [vaultAddress, bump] = web3_js_1.PublicKey.findProgramAddressSync([
                Buffer.from("vault"),
                provider.wallet.publicKey.toBuffer(),
                uniqueId.toArrayLike(Buffer, 'le', 8)
            ], program.programId);
            vaultPDA = vaultAddress;
            vaultBump = bump;
            console.log("Test setup completed:");
            console.log("Merkle Tree:", merkleTree.publicKey.toString());
            console.log("Vault PDA:", vaultPDA.toString());
            console.log("Share Mint:", shareMint.publicKey.toString());
        }
        catch (error) {
            console.error("Setup failed:", error);
            throw error;
        }
    }));
    it("Initialize vault and deposit cNFT", () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            // Airdrop SOL if needed
            const balance = yield provider.connection.getBalance(provider.wallet.publicKey);
            if (balance < 1000000000) {
                const sig = yield provider.connection.requestAirdrop(provider.wallet.publicKey, 1000000000);
                yield provider.connection.confirmTransaction(sig);
            }
            // Initialize vault
            const tx = yield program.methods
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
            // Mint cNFT
            const mintResult = yield (0, mpl_bubblegum_1.mintV1)(umi, {
                merkleTree: merkleTree.publicKey,
                leafOwner: leafOwner.publicKey,
                metadata: {
                    name: 'Test cNFT',
                    uri: 'https://example.com/test.json',
                    sellerFeeBasisPoints: 500,
                    collection: (0, umi_1.none)(),
                    creators: [],
                },
            }).sendAndConfirm(umi);
            console.log("cNFT mint signature:", mintResult.signature);
            // Get cNFT data
            const leaf = yield program.account.vault.fetch(vaultPDA);
            // Verify vault initialized correctly
            (0, chai_1.expect)(leaf.owner.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
            (0, chai_1.expect)(leaf.shareMint.toBase58()).to.equal(shareMint.publicKey.toBase58());
            (0, chai_1.expect)(leaf.isLocked).to.be.false;
            (0, chai_1.expect)(leaf.bump).to.equal(vaultBump);
            (0, chai_1.expect)(leaf.uniqueId.eq(uniqueId)).to.be.true;
            console.log("✅ Tests passed");
        }
        catch (error) {
            console.error("❌ Test failed:", error);
            throw error;
        }
    }));
});
