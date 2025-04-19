import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorEscrow } from "../target/types/anchor_escrow";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import BN from "bn.js";

describe("anchor_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.anchorEscrow as Program<AnchorEscrow>;

  const maker = provider.wallet;
  const taker = anchor.web3.Keypair.generate();
  const seed = new BN(8888);
  const receiveAmount = new BN(1_000_000);
  const depositAmount = new BN(1_000_000);

  let mintA: anchor.web3.PublicKey;
  let mintB: anchor.web3.PublicKey;
  let vault: anchor.web3.PublicKey;
  let escrow: anchor.web3.PublicKey;
  let makerAtaA: anchor.web3.PublicKey;
  let makerAtaB: anchor.web3.PublicKey;
  let takerAtaA: anchor.web3.PublicKey;
  let takerAtaB: anchor.web3.PublicKey;

  before("Setup mints, accounts", async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(taker.publicKey, 2e9)
    );

    mintA = await createMint(provider.connection, maker.payer, maker.publicKey, null, 6);
    mintB = await createMint(provider.connection, maker.payer, maker.publicKey, null, 6);

    [escrow] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    vault = await getAssociatedTokenAddress(mintA, escrow, true);

    // ATA derivations
    makerAtaA = await getAssociatedTokenAddress(mintA, maker.publicKey);
    makerAtaB = await getAssociatedTokenAddress(mintB, maker.publicKey);
    takerAtaA = await getAssociatedTokenAddress(mintA, taker.publicKey);
    takerAtaB = await getAssociatedTokenAddress(mintB, taker.publicKey);

    await getOrCreateAssociatedTokenAccount(provider.connection, maker.payer, mintA, maker.publicKey);
    await getOrCreateAssociatedTokenAccount(provider.connection, maker.payer, mintB, maker.publicKey);
    await getOrCreateAssociatedTokenAccount(provider.connection, maker.payer, mintB, taker.publicKey);

    await mintTo(provider.connection, maker.payer, mintA, makerAtaA, maker.payer, 2_000_000);
    await mintTo(provider.connection, maker.payer, mintB, takerAtaB, maker.payer, 2_000_000);
  });

  it("Maker initializes and deposits", async () => {
    const tx = await program.methods
      .make(seed, depositAmount, receiveAmount)
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        vault,
        escrow,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .rpc();
    console.log("✅ make() complete:", tx);
  });

  it("Taker completes escrow by sending and withdrawing", async () => {
    const tx = await program.methods
      .take()
      .accountsPartial({
        taker: taker.publicKey,
        maker: maker.publicKey,
        mintA,
        mintB,
        takerAtaA,
        takerAtaB,
        makerAtaB,
        vault,
        escrow,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([taker])
      .rpc();

    console.log("✅ take() complete:", tx);
  });

  it("Refund flow", async () => {
    const refundSeed = new BN(9999);
    const refundReceive = new BN(1_000_000);

    const [refundEscrow] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.publicKey.toBuffer(), refundSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const refundVault = await getAssociatedTokenAddress(mintA, refundEscrow, true);

    await program.methods
      .make(refundSeed, refundReceive, refundReceive)
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        vault: refundVault,
        escrow: refundEscrow,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .rpc();

    const tx = await program.methods
      .refund()
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        makerAtaA,
        escrow: refundEscrow,
        vault: refundVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .rpc();

    console.log("✅ refund() complete:", tx);
  });
});
