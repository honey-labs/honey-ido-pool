const anchor = require("@project-serum/anchor");
const assert = require("assert");
const {
    TOKEN_PROGRAM_ID,
    sleep,
    getTokenAccount,
    createMint,
    createTokenAccount,
    mintToAccount,
} = require("./utils");
const { PublicKey } = require("@solana/web3.js");

describe("ido-pool", () => {
    let cluster = 'https://api.devnet.solana.com';
    const provider = anchor.Provider.local(cluster);

    // Configure the client to use the local cluster.
    anchor.setProvider(provider);

    const program = anchor.workspace.IdoPool;
    // All mints default to 6 decimal places.
    const honeyIdoAmount = new anchor.BN(5000000);

    // These are all of the variables we assume exist in the world already and
    // are available to the client.
    let usdcMint = null;
    let honeyMint = null;
    let creatorUsdc = null; //token account
    let creatorHoney = null; //token account

    it("Initializes the state-of-the-world", async() => {
        usdcMint = await createMint(provider);
        honeyMint = await createMint(provider);
        creatorUsdc = await createTokenAccount(
            provider,
            usdcMint,
            provider.wallet.publicKey
        );
        creatorHoney = await createTokenAccount(
            provider,
            honeyMint,
            provider.wallet.publicKey
        );
        // Mint Honey tokens the will be distributed from the IDO pool.
        await mintToAccount(
            provider,
            honeyMint,
            creatorHoney,
            honeyIdoAmount,
            provider.wallet.publicKey
        );
        creator_honey_account = await getTokenAccount(provider, creatorHoney);
        assert.ok(creator_honey_account.amount.eq(honeyIdoAmount));
    });

    // These are all variables the client will have to create to initialize the
    // IDO pool
    let poolSigner = null; //pda of(honey mint)
    let redeemableMint = null; //owner: poolSigner
    let poolHoney = null; //owner: poolSigner
    let poolUsdc = null; //owner: poolSigner
    let poolAccount = null; //generated keypair

    let startIdoTs = null;
    let endDepositsTs = null;
    let endIdoTs = null;

    it("Initializes the IDO pool", async() => {
        // We use the honey mint address as the seed, could use something else though.
        const [_poolSigner, nonce] =
        await anchor.web3.PublicKey.findProgramAddress(
            [honeyMint.toBuffer()],
            new PublicKey("GGKqFCnfeGbs4nWNW4sa2A91RaMMzx8ookRs2ee7hHd5")
        );
        poolSigner = _poolSigner;
        console.log(poolSigner.toString());

        // Pool doesn't need a Redeemable SPL token account because it only
        // burns and mints redeemable tokens, it never stores them.
        redeemableMint = await createMint(provider, poolSigner);
        poolHoney = await createTokenAccount(provider, honeyMint, poolSigner);
        poolUsdc = await createTokenAccount(provider, usdcMint, poolSigner);

        poolAccount = anchor.web3.Keypair.generate();
        const nowBn = new anchor.BN(Date.now() / 1000);
        startIdoTs = nowBn.add(new anchor.BN(5));
        endIdoTs = nowBn.add(new anchor.BN(15));
        withdrawTs = nowBn.add(new anchor.BN(19));

        // Atomically create the new account and initialize it with the program.
        await program.rpc.initializePool(
            honeyIdoAmount,
            nonce,
            startIdoTs,
            endIdoTs,
            withdrawTs, {
                accounts: {
                    poolAccount: poolAccount.publicKey,
                    poolSigner,
                    distributionAuthority: provider.wallet.publicKey,
                    payer: provider.wallet.publicKey,
                    creatorHoney,
                    redeemableMint,
                    usdcMint,
                    honeyMint,
                    poolHoney,
                    poolUsdc,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
                signers: [poolAccount],
            }
        );

        creators_honey_account = await getTokenAccount(provider, creatorHoney);
        assert.ok(creators_honey_account.amount.eq(new anchor.BN(0)));
    });

    // We're going to need to start using the associated program account for creating token accounts
    // if not in testing, then definitely in production.

    let userUsdc = null; //token account
    let userRedeemable = null; //token account
    // 10 usdc
    const firstDeposit = new anchor.BN(10);

    it("Exchanges user USDC for redeemable tokens", async() => {
        // Wait until the IDO has opened.
        if (Date.now() < startIdoTs.toNumber() * 1000) {
            await sleep(startIdoTs.toNumber() * 1000 - Date.now() + 1000);
        }

        userUsdc = await createTokenAccount(
            provider,
            usdcMint,
            provider.wallet.publicKey
        );
        await mintToAccount(
            provider,
            usdcMint,
            userUsdc,
            firstDeposit,
            provider.wallet.publicKey
        );
        userRedeemable = await createTokenAccount(
            provider,
            redeemableMint,
            provider.wallet.publicKey
        );

        try {
            const tx = await program.rpc.exchangeUsdcForRedeemable(
                firstDeposit, {
                    accounts: {
                        poolAccount: poolAccount.publicKey,
                        poolSigner,
                        redeemableMint,
                        poolUsdc,
                        userAuthority: provider.wallet.publicKey,
                        userUsdc,
                        userRedeemable,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    },
                }
            );
        } catch (err) {
            console.log("This is the error message", err.toString());
        }
        poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
        assert.ok(poolUsdcAccount.amount.eq(firstDeposit));
        userRedeemableAccount = await getTokenAccount(provider, userRedeemable);
        assert.ok(userRedeemableAccount.amount.eq(firstDeposit));
    });

    // 23 usdc
    const secondDeposit = new anchor.BN(23);
    let totalPoolUsdc = null;

    it("Exchanges a second users USDC for redeemable tokens", async() => {
        secondUserUsdc = await createTokenAccount(
            provider,
            usdcMint,
            provider.wallet.publicKey
        );
        await mintToAccount(
            provider,
            usdcMint,
            secondUserUsdc,
            secondDeposit,
            provider.wallet.publicKey
        );
        secondUserRedeemable = await createTokenAccount(
            provider,
            redeemableMint,
            provider.wallet.publicKey
        );

        await program.rpc.exchangeUsdcForRedeemable(secondDeposit, {
            accounts: {
                poolAccount: poolAccount.publicKey,
                poolSigner,
                redeemableMint,
                poolUsdc,
                userAuthority: provider.wallet.publicKey,
                userUsdc: secondUserUsdc,
                userRedeemable: secondUserRedeemable,
                tokenProgram: TOKEN_PROGRAM_ID,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            },
        });

        totalPoolUsdc = firstDeposit.add(secondDeposit);
        poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
        assert.ok(poolUsdcAccount.amount.eq(totalPoolUsdc));
        secondUserRedeemableAccount = await getTokenAccount(
            provider,
            secondUserRedeemable
        );
        assert.ok(secondUserRedeemableAccount.amount.eq(secondDeposit));
    });

    // const firstWithdrawal = new anchor.BN(2_000_000);

    // it("Exchanges user Redeemable tokens for USDC", async () => {
    //     await program.rpc.exchangeRedeemableForUsdc(firstWithdrawal, {
    //         accounts: {
    //             poolAccount: poolAccount.publicKey,
    //             poolSigner,
    //             redeemableMint,
    //             poolUsdc,
    //             userAuthority: provider.wallet.publicKey,
    //             userUsdc,
    //             userRedeemable,
    //             tokenProgram: TOKEN_PROGRAM_ID,
    //             clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    //         },
    //     });

    //     totalPoolUsdc = totalPoolUsdc.sub(firstWithdrawal);
    //     poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
    //     assert.ok(poolUsdcAccount.amount.eq(totalPoolUsdc));
    //     userUsdcAccount = await getTokenAccount(provider, userUsdc);
    //     assert.ok(userUsdcAccount.amount.eq(firstWithdrawal));
    // });

    it("Exchanges user Redeemable tokens for honey", async() => {
        // Wait until the IDO has opened.
        if (Date.now() < withdrawTs.toNumber() * 1000) {
            await sleep(withdrawTs.toNumber() * 1000 - Date.now() + 2000);
        }
        // let firstUserRedeemable = firstDeposit.sub(firstWithdrawal);
        userHoney = await createTokenAccount(
            provider,
            honeyMint,
            provider.wallet.publicKey
        );

        await program.rpc.exchangeRedeemableForHoney(firstDeposit, {
            accounts: {
                poolAccount: poolAccount.publicKey,
                poolSigner,
                redeemableMint,
                poolHoney,
                userAuthority: provider.wallet.publicKey,
                userHoney,
                userRedeemable,
                tokenProgram: TOKEN_PROGRAM_ID,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            },
        });

        poolHoneyAccount = await getTokenAccount(provider, poolHoney);
        let redeemedHoney = firstDeposit.mul(honeyIdoAmount).div(totalPoolUsdc);
        let remainingHoney = honeyIdoAmount.sub(redeemedHoney);
        assert.ok(poolHoneyAccount.amount.eq(remainingHoney));
        userHoneyAccount = await getTokenAccount(provider, userHoney);
        assert.ok(userHoneyAccount.amount.eq(redeemedHoney));
    });

    it("Exchanges second users Redeemable tokens for honey", async() => {
        secondUserHoney = await createTokenAccount(
            provider,
            honeyMint,
            provider.wallet.publicKey
        );

        await program.rpc.exchangeRedeemableForHoney(secondDeposit, {
            accounts: {
                poolAccount: poolAccount.publicKey,
                poolSigner,
                redeemableMint,
                poolHoney,
                userAuthority: provider.wallet.publicKey,
                userHoney: secondUserHoney,
                userRedeemable: secondUserRedeemable,
                tokenProgram: TOKEN_PROGRAM_ID,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            },
        });

        poolHoneyAccount = await getTokenAccount(provider, poolHoney);
        assert.ok(poolHoneyAccount.amount.eq(new anchor.BN(0)));
        secondUserHoneyAccount = await getTokenAccount(
            provider,
            secondUserHoney
        );
    });

    it("Withdraws total USDC from pool account", async() => {
        const acc = await getTokenAccount(provider, poolUsdc);
        await program.rpc.withdrawPoolUsdc(new anchor.BN(acc.amount), {
            accounts: {
                poolAccount: poolAccount.publicKey,
                poolSigner,
                distributionAuthority: provider.wallet.publicKey,
                creatorUsdc,
                poolUsdc,
                payer: provider.wallet.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
            },
        });

        poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
        assert.ok(poolUsdcAccount.amount.eq(new anchor.BN(0)));
        creatorUsdcAccount = await getTokenAccount(provider, creatorUsdc);
        assert.ok(creatorUsdcAccount.amount.eq(totalPoolUsdc));
    });

    it("Modify ido time", async() => {
        await program.rpc.modifyIdoTime(
            new anchor.BN(1),
            new anchor.BN(2),
            new anchor.BN(3),
            new anchor.BN(4), {
                accounts: {
                    poolAccount: poolAccount.publicKey,
                    distributionAuthority: provider.wallet.publicKey,
                    payer: provider.wallet.publicKey,
                },
            }
        );
        const pool = await program.account.poolAccount.fetch(
            poolAccount.publicKey
        );
        assert.equal(pool.startIdoTs.toString(), "1");
    });
});