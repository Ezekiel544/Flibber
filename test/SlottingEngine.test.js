const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SlottingEngine", function () {
  let fibToken, liquidityPool, feeEngine, slottingEngine, mockUSDC;
  let owner, treasury, user, solver;

  beforeEach(async function () {
    [owner, treasury, user, solver] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("USD Coin", "USDC", ethers.parseEther("10000000"));

    const FIBToken = await ethers.getContractFactory("FIBToken");
    fibToken = await FIBToken.deploy(
      treasury.address, owner.address, owner.address,
      owner.address, owner.address, owner.address, owner.address
    );

    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    liquidityPool = await LiquidityPool.deploy(treasury.address);

    const FeeEngine = await ethers.getContractFactory("FeeEngine");
    feeEngine = await FeeEngine.deploy(await fibToken.getAddress(), treasury.address);

    const SlottingEngine = await ethers.getContractFactory("SlottingEngine");
    slottingEngine = await SlottingEngine.deploy(
      await liquidityPool.getAddress(),
      await feeEngine.getAddress(),
      await fibToken.getAddress()
    );

    await liquidityPool.setSlottingEngine(await slottingEngine.getAddress());
    await liquidityPool.setFeeEngine(await feeEngine.getAddress());
    await feeEngine.setSlottingEngine(await slottingEngine.getAddress());
    await feeEngine.setLiquidityPool(await liquidityPool.getAddress());
    await fibToken.addBurner(await feeEngine.getAddress());

    await liquidityPool.addSupportedAsset(await mockUSDC.getAddress());
    await liquidityPool.addSupportedAsset(await fibToken.getAddress());
    await slottingEngine.addSupportedToken(await mockUSDC.getAddress());
    await slottingEngine.addSupportedToken(await fibToken.getAddress());
    await slottingEngine.addSolver(solver.address);

    await mockUSDC.transfer(user.address, ethers.parseEther("10000"));
    await fibToken.connect(owner).transfer(user.address, ethers.parseEther("10000"));
  });

  it("should estimate fee correctly at 0.2%", async function () {
    const amount = ethers.parseEther("1000");
    const fee = await slottingEngine.estimateFee(amount);
    expect(fee).to.equal(ethers.parseEther("2"));
  });

  it("should reject slot with unsupported token", async function () {
    const randomToken = ethers.Wallet.createRandom().address;
    await expect(
      slottingEngine.connect(user).requestSlot(randomToken, await fibToken.getAddress(), 100, 0)
    ).to.be.revertedWithCustomError(slottingEngine, "TokenNotSupported");
  });

  it("should reject slot with same token", async function () {
    const usdcAddr = await mockUSDC.getAddress();
    await expect(
      slottingEngine.connect(user).requestSlot(usdcAddr, usdcAddr, 100, 0)
    ).to.be.revertedWithCustomError(slottingEngine, "SameToken");
  });

  it("should reject slot with zero amount", async function () {
    await expect(
      slottingEngine.connect(user).requestSlot(
        await mockUSDC.getAddress(), await fibToken.getAddress(), 0, 0
      )
    ).to.be.revertedWithCustomError(slottingEngine, "ZeroAmount");
  });
});
