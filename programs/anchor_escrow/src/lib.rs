pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("7cf2rrVt6RH5Duv9KFJFuaRxTh3LXxGJeMEeTPKG9gpT");

#[program]
pub mod anchor_escrow {
    use super::*;

    pub fn initialize(ctx:Context<Make>,seed:u64,recieve_amount:u64) -> Result<()>{
        ctx.accounts.init_escrow(seed, recieve_amount,&ctx.bumps)?;
        Ok(())
    }

    pub fn deposit(ctx:Context<Make>,deposit:u64)->Result<()>{
        ctx.accounts.deposit(deposit)?;
        Ok(())
    }

    pub fn send_to_vault(ctx:Context<Take>) -> Result<()>{
        ctx.accounts.send_to_vault()?;
        Ok(())
    }

    pub fn withdraw_and_close(ctx:Context<Take>) ->Result<()> {
        ctx.accounts.withdraw_and_close()?;
        Ok(())
    }

    pub fn refund_and_close(ctx:Context<Refund>) -> Result<()>{
        ctx.accounts.refund_and_close()?;
        Ok(())
    }
}
