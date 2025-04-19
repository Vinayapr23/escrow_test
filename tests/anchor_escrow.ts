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

  const taker = anchor.web3.Keypair.generate();
  const seed = new anchor.BN(8888);
  const receiveAmount = new anchor.BN(1_000_000);
  const depositAmount = new anchor.BN(1_000_000);

  let mintA: anchor.web3.PublicKey;
  let mintB: anchor.web3.PublicKey;
  let makerAtaA: anchor.web3.PublicKey;
  let makerAtaB: anchor.web3.PublicKey;
  let takerAtaA: anchor.web3.PublicKey;
  let takerAtaB: anchor.web3.PublicKey;
  let vault: anchor.web3.PublicKey;
  let escrow: anchor.web3.PublicKey;
  let escrowBump: number;

  const maker = provider.wallet;

  before("setup mints and accounts", async () => {
    // Airdrop to taker
    const sig = await provider.connection.requestAirdrop(taker.publicKey, 2e9);
    await provider.connection.confirmTransaction(sig);

    // Create mint A and B
    mintA = await createMint(provider.connection, maker.payer, maker.publicKey, null, 6);
    mintB = await createMint(provider.connection, maker.payer, maker.publicKey, null, 6);

    /*[escrow, escrowBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );*/

    const escrow =await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"),maker.publicKey.toBuffer(), seed.toBuffer("le", 8)],
      program.programId
    )[0];
    
    vault = await getAssociatedTokenAddress(mintA, escrow, true);
    console.log("Derived Escrow:", escrow.toBase58());

    // Create all ATA accounts
    makerAtaA = await getAssociatedTokenAddress(mintA, maker.publicKey);
    makerAtaB = await getAssociatedTokenAddress(mintB, maker.publicKey);
    takerAtaA = await getAssociatedTokenAddress(mintA, taker.publicKey);
    takerAtaB = await getAssociatedTokenAddress(mintB, taker.publicKey);

    await getOrCreateAssociatedTokenAccount(provider.connection, maker.payer, mintA, maker.publicKey);
    await getOrCreateAssociatedTokenAccount(provider.connection, maker.payer, mintB, maker.publicKey);
    await getOrCreateAssociatedTokenAccount(provider.connection, maker.payer, mintB, taker.publicKey);

    // Mint tokens to both parties
    await mintTo(provider.connection, maker.payer, mintA, makerAtaA, maker.payer, 2_000_000);
    await mintTo(provider.connection, maker.payer, mintB, takerAtaB, maker.payer, 2_000_000);
  });

  it("Initializes the escrow", async () => {
    const tx = await program.methods
      .initialize(seed, receiveAmount)
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

    console.log("✅ Initialized escrow:", tx);
  });

  it("Maker deposits mint A to vault", async () => {
    const tx = await program.methods
      .deposit(depositAmount)
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

    console.log("✅ Maker deposited token A:", tx);
  });

  it("Taker sends token B to maker", async () => {
    const tx = await program.methods
      .sendToVault()
      .accountsPartial({
        taker: taker.publicKey,
        maker: maker.publicKey,
        mintA,
        mintB,
        takerAtaB,
        makerAtaB,
        escrow,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([taker])
      .rpc();

    console.log("✅ Taker sent token B:", tx);
  });

  it("Taker withdraws token A and closes escrow", async () => {
    const tx = await program.methods
      .withdrawAndClose()
      .accountsPartial({
        taker: taker.publicKey,
        maker: maker.publicKey,
        mintA,
        mintB,
        takerAtaA,
        takerAtaB,
        makerAtaB,
        escrow,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([taker])
      .rpc();

    console.log("✅ Taker claimed token A:", tx);
  });

  it("Refund (if taker did not participate)", async () => {
    const refundSeed = new anchor.BN(9999);
    const refundReceive = new anchor.BN(1_000_000);

    const [altEscrow, altBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.publicKey.toBuffer(), refundSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const altVault = await getAssociatedTokenAddress(mintA, altEscrow, true);

    // Re-init and deposit again
    await program.methods
      .initialize(refundSeed, refundReceive)
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        vault: altVault,
        escrow: altEscrow,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .rpc();

    await program.methods
      .deposit(refundReceive)
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        mintB,
        makerAtaA,
        vault: altVault,
        escrow: altEscrow,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .rpc();

    // Now refund
    const tx = await program.methods
      .refundAndClose()
      .accountsPartial({
        maker: maker.publicKey,
        mintA,
        makerAtaA,
        escrow: altEscrow,
        vault: altVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .rpc();

    console.log("✅ Maker refunded and closed:", tx);
  });
});
