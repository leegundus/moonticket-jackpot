use anchor_lang::prelude::*;
use anchor_lang::prelude::UncheckedAccount;
use std::str::FromStr;

declare_id!("GmyMFG4QwHh2YK4bjy489eBzf9Hzf3BLZ1sFfznoeWpB");

const TREASURY_WALLET: &str = "FrAvtjXo5JCsWrjcphvWCGQDrXX8PuEbN2qu2SGdvurG";
const OPS_WALLET: &str = "nJmonUssRvbp85Nvdd9Bnxgh86Hf6BtKfu49RdcoYE9";

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        seeds = [b"jackpot"],
        bump,
        payer = user,
        space = 8 + Jackpot::SIZE
    )]
    pub jackpot: Account<'info, Jackpot>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EnterJackpot<'info> {
    #[account(mut, seeds = [b"jackpot"], bump = jackpot.bump)]
    pub jackpot: Account<'info, Jackpot>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserAccount::SIZE,
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DrawJackpot<'info> {
    #[account(mut, seeds = [b"jackpot"], bump = jackpot.bump)]
    pub jackpot: Account<'info, Jackpot>,

    /// CHECK: Hardcoded treasury wallet
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: Hardcoded ops wallet
    #[account(mut)]
    pub ops: UncheckedAccount<'info>,

    /// CHECK: Selected winner
    #[account(mut)]
    pub user: UncheckedAccount<'info>,
    #[account(seeds = [b"user", user.key().as_ref()], bump)]
    pub user_account: Account<'info, UserAccount>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Debug, Default)]
pub struct Jackpot {
    pub bump: u8,
}

impl Jackpot {
    pub const SIZE: usize = 1;
}

#[account]
#[derive(Debug, Default)]
pub struct UserAccount {
    pub tix_balance: u64,
    pub tix_purchased: u64,
}

impl UserAccount {
    pub const SIZE: usize = 8 + 8;
}

#[program]
pub mod moonticket_jackpot {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let jackpot = &mut ctx.accounts.jackpot;
        jackpot.bump = ctx.bumps.jackpot;
        Ok(())
    }

    pub fn enter_jackpot(ctx: Context<EnterJackpot>, usd_spent: u64) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;

        user_account.tix_purchased += usd_spent;
        user_account.tix_balance += usd_spent;

        Ok(())
    }

    pub fn execute_moon_draw(ctx: Context<DrawJackpot>, winner_pubkey: Pubkey) -> Result<()> {
        let winner_account = &ctx.accounts.user_account;

        let is_eligible = winner_account.tix_balance > 0;

        if is_eligible {
            let expected_treasury = Pubkey::from_str(TREASURY_WALLET).unwrap();
            require_keys_eq!(ctx.accounts.treasury.key(), expected_treasury, JackpotError::InvalidTreasuryWallet);

            let expected_ops = Pubkey::from_str(OPS_WALLET).unwrap();
            require_keys_eq!(ctx.accounts.ops.key(), expected_ops, JackpotError::InvalidOpsWallet);

            let treasury_info = ctx.accounts.treasury.to_account_info();
            let winner_info = ctx.accounts.user.to_account_info();
            let ops_info = ctx.accounts.ops.to_account_info();

            let total = treasury_info.lamports();
            let winner_share = total * 90 / 100;
            let ops_share = total - winner_share;

            **treasury_info.try_borrow_mut_lamports()? -= total;
            **winner_info.try_borrow_mut_lamports()? += winner_share;
            **ops_info.try_borrow_mut_lamports()? += ops_share;
        } else {
            msg!("No eligible Moon Draw winner.");
        }

        Ok(())
    }
}

#[error_code]
pub enum JackpotError {
    #[msg("Invalid treasury wallet address.")]
    InvalidTreasuryWallet,
    #[msg("Invalid ops wallet address.")]
    InvalidOpsWallet,
}
