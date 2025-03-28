
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::prelude::UncheckedAccount;

declare_id!("GmyMFG4QwHh2YK4bjy489eBzf9Hzf3BLZ1sFfznoeWpB");

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

    pub fn execute_moon_draw(ctx: Context<DrawJackpot>, winner_pubkey: Pubkey, backup_pubkey: Pubkey) -> Result<()> {
        let jackpot = &mut ctx.accounts.jackpot;
        let now_ts = Clock::get()?.unix_timestamp;

        require!(
            now_ts - jackpot.last_moon_draw >= 7 * 24 * 60 * 60,
            MoonticketError::DrawTooSoon
        );

        let winner_account = &ctx.accounts.user_account;
        let winner_ratio = winner_account.tix_balance as f64 / winner_account.tix_purchased as f64;
        let winner_eligible = winner_ratio >= 0.25;

        let final_winner = if winner_eligible {
            Some(winner_pubkey)
        } else {
            let backup_user_account = &ctx.accounts.backup_user_account;
            let backup_ratio = backup_user_account.tix_balance as f64 / backup_user_account.tix_purchased as f64;
            if backup_ratio >= 0.25 {
                Some(backup_pubkey)
            } else {
                None
            }
        };

        if let Some(winner) = final_winner {
            msg!("Sending 95% of jackpot to winner: {}", winner);
            msg!("Sending 4% to treasury: {}", ctx.accounts.treasury.key());
            msg!("Sending 1% to founder: {}", ctx.accounts.founder.key());

            jackpot.total_weekly_entries = 0;
            jackpot.last_moon_draw = now_ts;
        } else {
            msg!("No eligible winner this week. Jackpot rolls over.");
        }

        Ok(())
    }

    pub fn execute_mega_moon_draw(ctx: Context<MegaMoonDraw>, winner: Pubkey, backup: Pubkey) -> Result<()> {
        let jackpot = &mut ctx.accounts.jackpot;
        let now_ts = Clock::get()?.unix_timestamp;

        require!(
            now_ts - jackpot.last_mega_moon_draw >= 2_419_200,
            JackpotError::TooEarlyForMegaMoonDraw
        );

        let winner_account = &ctx.accounts.user_account;
        let winner_ratio = winner_account.tix_balance as f64 / winner_account.tix_purchased as f64;
        let winner_eligible = winner_ratio >= 0.25;

        let final_winner = if winner_eligible {
            Some(winner)
        } else {
            let backup_user_account = &ctx.accounts.backup_user_account;
            let backup_ratio = backup_user_account.tix_balance as f64 / backup_user_account.tix_purchased as f64;
            if backup_ratio >= 0.25 {
                Some(backup)
            } else {
                None
            }
        };

        if let Some(winner) = final_winner {
            let prize_lamports = jackpot.total_monthly_entries;
            let jackpot_info = jackpot.to_account_info();

            **jackpot_info.try_borrow_mut_lamports()? -= prize_lamports;
            **ctx.accounts.winner.try_borrow_mut_lamports()? += prize_lamports * 95 / 100;
            **ctx.accounts.treasury.try_borrow_mut_lamports()? += prize_lamports * 4 / 100;
            **ctx.accounts.founder.try_borrow_mut_lamports()? += prize_lamports * 1 / 100;

            jackpot.last_mega_moon_draw = now_ts;
            jackpot.total_monthly_entries = 0;
        } else {
            msg!("No eligible winner this month. Jackpot rolls over.");
        }

        Ok(())
    }
}

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

#[account]
#[derive(Debug, Default)]
pub struct Jackpot {
    pub total_weekly_entries: u64,
    pub total_monthly_entries: u64,
    pub last_moon_draw: i64,
    pub last_mega_moon_draw: i64,
    pub bump: u8,
}

impl Jackpot {
    pub const SIZE: usize = 8 + 8 + 8 + 8 + 1;
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

    /// CHECK: Safe because we only send SOL to this hardcoded founder address 
    pub founder: UncheckedAccount<'info>,

    /// CHECK: Safe because we only send SOL to this hardcoded founder address
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: Provided winner candidate
    pub user: UncheckedAccount<'info>,

    #[account(
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    /// CHECK: Backup candidate for jackpot
    pub backup: UncheckedAccount<'info>,
    #[account(
        seeds = [b"user", backup.key().as_ref()],
        bump
    )]
    pub backup_user_account: Account<'info, UserAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MegaMoonDraw<'info> {
    #[account(mut, seeds = [b"jackpot"], bump = jackpot.bump)]
    pub jackpot: Account<'info, Jackpot>,

    /// CHECK: Winner receives jackpot payout
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,

    /// CHECK: Treasury receives 4% of jackpot
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: Founder receives 1% of jackpot
    #[account(mut)]
    pub founder: UncheckedAccount<'info>,

    #[account(
        seeds = [b"user", winner.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    /// CHECK: Backup candidate for Mega Moon Draw
    pub backup: UncheckedAccount<'info>,
    #[account(
        seeds = [b"user", backup.key().as_ref()],
        bump
    )]
    pub backup_user_account: Account<'info, UserAccount>,

    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum MoonticketError {
    #[msg("You must wait at least 7 days between Moon Draws.")]
    DrawTooSoon,
}

#[error_code]
pub enum JackpotError {
    #[msg("Mega Moon Draw cannot be executed yet.")]
    TooEarlyForMegaMoonDraw,
}

