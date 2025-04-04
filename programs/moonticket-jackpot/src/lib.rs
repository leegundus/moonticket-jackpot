use anchor_lang::prelude::*;
use anchor_lang::prelude::UncheckedAccount;
use std::str::FromStr;

declare_id!("GmyMFG4QwHh2YK4bjy489eBzf9Hzf3BLZ1sFfznoeWpB");

const OPS_WALLET: &str = "FrAvtjXo5JCsWrjcphvWCGQDrXX8PuEbN2qu2SGdvurG";

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

    /// CHECK: Hardcoded ops wallet
    pub ops: UncheckedAccount<'info>,

    /// CHECK: Selected winner
    pub user: UncheckedAccount<'info>,
    #[account(seeds = [b"user", user.key().as_ref()], bump)]
    pub user_account: Account<'info, UserAccount>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Debug, Default)]
pub struct Jackpot {
    pub total_weekly_entries: u64,
    pub total_monthly_entries: u64,
    pub last_moon_draw: i64,
    pub last_mega_moon_draw: i64,
    pub last_moon_winner: Pubkey,
    pub last_mega_winner: Pubkey,
    pub moon_rolled: bool,
    pub mega_rolled: bool,
    pub bump: u8,
}

impl Jackpot {
    pub const SIZE: usize = 8 + 8 + 8 + 8 + 32 + 32 + 1 + 1 + 1;
}

#[account]
#[derive(Debug, Default)]
pub struct UserAccount {
    pub weekly_entries: u64,
    pub monthly_entries: u64,
    pub tix_balance: u64,
    pub tix_purchased: u64,
}

impl UserAccount {
    pub const SIZE: usize = 8 + 8 + 8 + 8;
}

#[program]
pub mod moonticket_jackpot {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let jackpot = &mut ctx.accounts.jackpot;
        jackpot.bump = ctx.bumps.jackpot;
        jackpot.total_weekly_entries = 0;
        jackpot.total_monthly_entries = 0;
        jackpot.last_moon_draw = 0;
        jackpot.last_mega_moon_draw = 0;
        jackpot.last_moon_winner = Pubkey::default();
        jackpot.last_mega_winner = Pubkey::default();
        jackpot.moon_rolled = false;
        jackpot.mega_rolled = false;
        Ok(())
    }

    pub fn enter_jackpot(ctx: Context<EnterJackpot>, usd_spent: u64) -> Result<()> {
        let jackpot = &mut ctx.accounts.jackpot;
        let user_account = &mut ctx.accounts.user_account;

        jackpot.total_weekly_entries += usd_spent;
        jackpot.total_monthly_entries += usd_spent;
        user_account.weekly_entries += usd_spent;
        user_account.monthly_entries += usd_spent;
        user_account.tix_purchased += usd_spent;
        user_account.tix_balance += usd_spent;

        Ok(())
    }

    pub fn execute_moon_draw(ctx: Context<DrawJackpot>, winner_pubkey: Pubkey) -> Result<()> {
        let jackpot = &mut ctx.accounts.jackpot;
        let jackpot_lamports = jackpot.get_lamports();
        let now_ts = Clock::get()?.unix_timestamp;
        let winner_account = &ctx.accounts.user_account;

        let is_eligible = winner_account.tix_balance > 0;

        if is_eligible {
            let expected_ops = Pubkey::from_str(OPS_WALLET).unwrap();
            require_keys_eq!(ctx.accounts.ops.key(), expected_ops, JackpotError::InvalidOpsWallet);

            let ops = ctx.accounts.ops.to_account_info();
            let winner = ctx.accounts.user.to_account_info();
            let jackpot_info = jackpot.to_account_info();

            let amount = jackpot_lamports;
            let winner_amount = amount * 90 / 100;
            let ops_amount = amount * 10 / 100;

            **jackpot_info.try_borrow_mut_lamports()? -= winner_amount + ops_amount;
            **winner.try_borrow_mut_lamports()? += winner_amount;
            **ops.try_borrow_mut_lamports()? += ops_amount;

            jackpot.total_weekly_entries = 0;
            jackpot.last_moon_draw = now_ts;
            jackpot.last_moon_winner = winner_pubkey;
            jackpot.moon_rolled = false;
        } else {
            msg!("No eligible Moon Draw winner. Rollover.");
            jackpot.moon_rolled = true;
        }

        Ok(())
    }
}

#[error_code]
pub enum JackpotError {
    #[msg("Invalid ops wallet address.")]
    InvalidOpsWallet,
}

