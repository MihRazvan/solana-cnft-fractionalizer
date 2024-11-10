use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use mpl_bubblegum::cpi::accounts::Transfer;
use mpl_bubblegum::cpi::transfer;
use mpl_bubblegum::Hash;
use spl_account_compression::program::SplAccountCompression;
// Remove unnecessary imports
// use spl_noop::program::SplNoop;

declare_id!("YourProgramIDHere");

#[program]
pub mod cnft_fractionalizer {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        bump: u8,
        num_shares: u64,
        unique_id: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.initializer.key();
        vault.share_mint = ctx.accounts.share_mint.key();
        vault.total_shares = num_shares;
        vault.is_locked = false;
        vault.bump = bump;
        vault.unique_id = unique_id;

        Ok(())
    }

    pub fn deposit_cnft(
        ctx: Context<DepositCNFT>,
        root: [u8; 32],
        data_hash: [u8; 32],
        creator_hash: [u8; 32],
        nonce: u64,
        index: u32,
    ) -> Result<()> {
        require!(!ctx.accounts.vault.is_locked, ErrorCode::VaultLocked);

        // Prepare the accounts for the Bubblegum transfer instruction
        let cpi_accounts = Transfer {
            tree_authority: ctx.accounts.tree_authority.to_account_info(),
            leaf_owner: ctx.accounts.depositor.to_account_info(),
            leaf_delegate: ctx.accounts.depositor.to_account_info(), // Assuming depositor is the delegate
            new_leaf_owner: ctx.accounts.vault.to_account_info(),
            merkle_tree: ctx.accounts.merkle_tree.to_account_info(),
            log_wrapper: ctx.accounts.log_wrapper.to_account_info(),
            compression_program: ctx.accounts.compression_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };

        // Create the CPI context, including the remaining accounts (Merkle proof)
        let cpi_ctx = CpiContext::new(
            ctx.accounts.bubblegum_program.to_account_info(),
            cpi_accounts,
        ).with_remaining_accounts(ctx.remaining_accounts.to_vec());

        // Call the transfer instruction in the Bubblegum program
        transfer(cpi_ctx, root, data_hash, creator_hash, nonce, index)?;

        // Store the cNFT data in the vault
        let vault = &mut ctx.accounts.vault;
        vault.merkle_root = root;
        vault.data_hash = data_hash;
        vault.creator_hash = creator_hash;
        vault.nonce = nonce;
        vault.index = index;
        vault.is_locked = true;

        // Mint fractional tokens to the depositor
        let seeds = &[
            b"vault",
            ctx.accounts.depositor.key.as_ref(),
            &vault.unique_id.to_le_bytes(),
            &[vault.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = token::MintTo {
            mint: ctx.accounts.share_mint.to_account_info(),
            to: ctx.accounts.depositor_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer,
            ),
            ctx.accounts.vault.total_shares,
        )?;

        Ok(())
    }

    pub fn withdraw_cnft(ctx: Context<WithdrawCNFT>) -> Result<()> {
        let depositor_balance = ctx.accounts.depositor_token_account.amount;
        require!(
            depositor_balance == ctx.accounts.vault.total_shares,
            ErrorCode::InsufficientShares
        );

        // Burn all fractional tokens
        let cpi_accounts = token::Burn {
            mint: ctx.accounts.share_mint.to_account_info(),
            from: ctx.accounts.depositor_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };

        token::burn(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
            ctx.accounts.vault.total_shares,
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.is_locked = false;
        vault.merkle_root = [0; 32];
        vault.data_hash = [0; 32];
        vault.creator_hash = [0; 32];
        vault.nonce = 0;
        vault.index = 0;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(bump: u8, num_shares: u64, unique_id: u64)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,
    #[account(
        init,
        payer = initializer,
        space = 8 + Vault::LEN,
        seeds = [b"vault", initializer.key().as_ref(), &unique_id.to_le_bytes()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        init,
        payer = initializer,
        mint::decimals = 9,
        mint::authority = vault,
    )]
    pub share_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct DepositCNFT<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", depositor.key().as_ref(), &vault.unique_id.to_le_bytes()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        constraint = vault.share_mint == share_mint.key()
    )]
    pub share_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = depositor_token_account.mint == share_mint.key(),
        constraint = depositor_token_account.owner == depositor.key()
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,

    /// CHECK: Verified in Bubblegum program
    #[account(mut)]
    pub tree_authority: UncheckedAccount<'info>,
    /// CHECK: Verified in Bubblegum program
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,
    /// CHECK: Verified in Bubblegum program
    pub log_wrapper: UncheckedAccount<'info>,

    pub bubblegum_program: Program<'info, mpl_bubblegum::program::Bubblegum>,
    pub compression_program: Program<'info, SplAccountCompression>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,

    /// Remaining accounts for Merkle proof
    #[remaining_accounts]
    pub proof: Vec<AccountInfo<'info>>,
}

#[derive(Accounts)]
pub struct WithdrawCNFT<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub share_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = depositor_token_account.mint == share_mint.key(),
        constraint = depositor_token_account.owner == depositor.key()
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Vault {
    pub owner: Pubkey,
    pub share_mint: Pubkey,
    pub total_shares: u64,
    pub is_locked: bool,
    pub merkle_root: [u8; 32],
    pub data_hash: [u8; 32],
    pub creator_hash: [u8; 32],
    pub nonce: u64,
    pub index: u32,
    pub bump: u8,
    pub unique_id: u64,
}

impl Vault {
    pub const LEN: usize = 32 + 32 + 8 + 1 + 32 + 32 + 32 + 8 + 4 + 1 + 8;
}

#[error_code]
pub enum ErrorCode {
    #[msg("Vault is already locked")]
    VaultLocked,
    #[msg("Insufficient shares to withdraw")]
    InsufficientShares,
}
