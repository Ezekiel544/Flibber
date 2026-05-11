const { expect }        = require("chai");
const { ethers }        = require("hardhat");
const { loadFixture }   = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("FLIBBER Protocol", function () {

  async function deployFlibberFixture() {
    const [owner, treasury, user1, user2, solver, lp1] = await ethers.getSigners();

    const FIBToken = await ethers.getContractFactory("FIBToken");
    const fibToken = await FIBToken.deploy(treasury.address);

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const pool = await LiquidityPool.deploy();

    const FeeEngine = await ethers.getContractFactory("FeeEngine");
    const feeEngine = await FeeEngine.deploy(
      await fibToken.getAddress(), await pool.getAddress(), treasury.address
    );

    const SlottingEngine = await ethers.getContractFactory("SlottingEngine");
    const slotEngine = await SlottingEngine.deploy(
      await pool.getAddress(), await feeEngine.getAddress(), await fibToken.getAddress()
    );

    const FIBStaking = await ethers.getContractFactory("FIBStaking");
    const staking = await FIBStaking.deploy(await fibToken.getAddress());

    const SLOTTING_ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SLOTTING_ENGINE_ROLE"));
    const COLLECTOR_ROLE       = ethers.keccak256(ethers.toUtf8Bytes("COLLECTOR_ROLE"));
    const FEE_BURNER_ROLE      = ethers.keccak256(ethers.toUtf8Bytes("FEE_BURNER_ROLE"));
    const SOLVER_ROLE          = ethers.keccak256(ethers.toUtf8Bytes("SOLVER_ROLE"));

    await pool.grantRole(SLOTTING_ENGINE_ROLE, await slotEngine.getAddress());
    await feeEngine.grantRole(COLLECTOR_ROLE,  await slotEngine.getAddress());
    await fibToken.grantRole(FEE_BURNER_ROLE,  await feeEngine.getAddress());
    await slotEngine.grantRole(SOLVER_ROLE,    solver.address);

    await pool.addSupportedAsset(await usdc.getAddress());
    await pool.addSupportedAsset(await fibToken.getAddress());

    await fibToken.connect(treasury).transfer(user1.address, ethers.parseEther("10000"));
    await fibToken.connect(treasury).transfer(lp1.address,   ethers.parseEther("100000"));
    await usdc.mint(user1.address,  ethers.parseUnits("10000", 6));
    await usdc.mint(lp1.address,    ethers.parseUnits("100000", 6));
    await usdc.mint(solver.address, ethers.parseUnits("50000", 6));

    return { fibToken, usdc, pool, feeEngine, slotEngine, staking, owner, treasury, user1, user2, solver, lp1 };
  }

  describe("FIBToken", function () {
    it("Has correct name and symbol", async function () {
      const { fibToken } = await loadFixture(deployFlibberFixture);
      expect(await fibToken.name()).to.equal("FLIBBER Token");
      expect(await fibToken.symbol()).to.equal("FIB");
    });

    it("Has max supply of 1 billion", async function () {
      const { fibToken } = await loadFixture(deployFlibberFixture);
      expect(await fibToken.totalSupply()).to.equal(ethers.parseEther("1000000000"));
    });

    it("Mints all tokens to treasury", async function () {
      const { fibToken, treasury } = await loadFixture(deployFlibberFixture);
      expect(await fibToken.balanceOf(treasury.address)).to.be.gt(0);
    });

    it("Burns tokens correctly", async function () {
      const { fibToken } = await loadFixture(deployFlibberFixture);
      const FEE_BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FEE_BURNER_ROLE"));
      const [,,,,, burner] = await ethers.getSigners();
      await fibToken.grantRole(FEE_BURNER_ROLE, burner.address);
      const [deployer] = await ethers.getSigners();
      await fibToken.transfer(burner.address, ethers.parseEther("1000"));
      const before = await fibToken.totalSupply();
      await fibToken.connect(burner).burnFee(ethers.parseEther("1000"));
      expect(before - await fibToken.totalSupply()).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("LiquidityPool", function () {
    it("Allows LP deposit", async function () {
      const { pool, usdc, lp1 } = await loadFixture(deployFlibberFixture);
      const amount = ethers.parseUnits("1000", 6);
      await usdc.connect(lp1).approve(await pool.getAddress(), amount);
      await pool.connect(lp1).deposit(await usdc.getAddress(), amount);
      expect(await pool.getPoolBalance(await usdc.getAddress())).to.equal(amount);
    });

    it("Allows LP withdrawal", async function () {
      const { pool, usdc, lp1 } = await loadFixture(deployFlibberFixture);
      const amount = ethers.parseUnits("1000", 6);
      await usdc.connect(lp1).approve(await pool.getAddress(), amount);
      await pool.connect(lp1).deposit(await usdc.getAddress(), amount);
      const before = await usdc.balanceOf(lp1.address);
      await pool.connect(lp1).withdraw(await usdc.getAddress(), amount);
      expect(await usdc.balanceOf(lp1.address) - before).to.equal(amount);
    });
  });

  describe("SlottingEngine", function () {
    it("Creates slot and fills from pool", async function () {
      const { slotEngine, usdc, fibToken, pool, user1, lp1 } = await loadFixture(deployFlibberFixture);
      const lpAmount  = ethers.parseUnits("1000", 6);
      await usdc.connect(lp1).approve(await pool.getAddress(), lpAmount);
      await pool.connect(lp1).deposit(await usdc.getAddress(), lpAmount);

      const amountIn  = ethers.parseEther("500");
      const amountOut = ethers.parseUnits("50", 6);
      const before    = await usdc.balanceOf(user1.address);

      await fibToken.connect(user1).approve(await slotEngine.getAddress(), amountIn);
      await slotEngine.connect(user1).requestSlot(
        await fibToken.getAddress(), amountIn,
        await usdc.getAddress(), amountOut,
        user1.address, false, 0
      );
      expect(await usdc.balanceOf(user1.address) - before).to.equal(amountOut);
    });

    it("Cancels pending slot and refunds", async function () {
      const { slotEngine, usdc, fibToken, user1 } = await loadFixture(deployFlibberFixture);
      const amountIn = ethers.parseEther("100");
      await fibToken.connect(user1).approve(await slotEngine.getAddress(), amountIn);
      await slotEngine.connect(user1).requestSlot(
        await fibToken.getAddress(), amountIn,
        await usdc.getAddress(), ethers.parseUnits("10", 6),
        user1.address, false, 0
      );
      const slotId = await slotEngine.slotCounter();
      const before = await fibToken.balanceOf(user1.address);
      await slotEngine.connect(user1).cancelSlot(slotId);
      expect(await fibToken.balanceOf(user1.address)).to.be.gt(before);
    });
  });

  describe("FIBStaking", function () {
    it("Stakes FIB correctly", async function () {
      const { staking, fibToken, user1 } = await loadFixture(deployFlibberFixture);
      const amount = ethers.parseEther("1000");
      await fibToken.connect(user1).approve(await staking.getAddress(), amount);
      await staking.connect(user1).stake(amount);
      expect((await staking.getStakeInfo(user1.address)).amount).to.equal(amount);
    });

    it("Voting power equals staked amount", async function () {
      const { staking, fibToken, user1 } = await loadFixture(deployFlibberFixture);
      const amount = ethers.parseEther("5000");
      await fibToken.connect(user1).approve(await staking.getAddress(), amount);
      await staking.connect(user1).stake(amount);
      expect(await staking.votingPower(user1.address)).to.equal(amount);
    });

    it("Enforces 7 day unstake cooldown", async function () {
      const { staking, fibToken, user1 } = await loadFixture(deployFlibberFixture);
      const amount = ethers.parseEther("1000");
      await fibToken.connect(user1).approve(await staking.getAddress(), amount);
      await staking.connect(user1).stake(amount);
      await staking.connect(user1).requestUnstake(amount);
      await expect(staking.connect(user1).unstake()).to.be.revertedWith("Staking: cooldown active");
    });
  });
});
