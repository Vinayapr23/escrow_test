use crate::state::Escrow;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};


#[derive(Accounts)]

pub struct Refund<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,
    #[account(
        mint::token_program =token_program
    )]
    pub mint_a: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = maker,
        associated_token::token_program =token_program
    )]
    pub maker_ata_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        close = maker,
        has_one = mint_a, // checks if same as escrow mint_a
        has_one =maker, //check has_one checks mint_a filed of accounts and field inside the escrow
        seeds = [b"escrow",maker.key().as_ref(),escrow.seed.to_le_bytes().as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = maker,
        associated_token::token_program =token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> Refund<'info> {
    pub fn refund_and_close(&mut self) -> Result<()> {
        let cpi_program = self.token_program.to_account_info();

        let cpi_account = TransferChecked {
            from: self.vault.to_account_info(),
            to: self.maker_ata_a.to_account_info(),
            mint: self.mint_a.to_account_info(),
            authority: self.escrow.to_account_info(),
        };

        let maker_key = self.maker.key();
        let seeds = self.escrow.seed.to_le_bytes();

        let seed = &[
            b"escrow",
            maker_key.as_ref(),
            seeds.as_ref(),
            &[self.escrow.bump],
        ];
        let signer_seeds = &[&seed[..]];  //because you are transferring from vault

        let cpi_context =
            CpiContext::new_with_signer(cpi_program.clone(), cpi_account, signer_seeds);

        transfer_checked(
            cpi_context,
            self.escrow.receive_amount,
            self.mint_a.decimals,
        )?;

        let cpi_account_close = CloseAccount {
            account: self.vault.to_account_info(),
            destination: self.maker.to_account_info(),
            authority: self.escrow.to_account_info(),
        };

        let cpi_context_close =
            CpiContext::new_with_signer(cpi_program, cpi_account_close, signer_seeds);

        close_account(cpi_context_close)?;

        Ok(())
    }
}