const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FIBToken", function () {
  let fibToken, owner, treasury, liquidity, ecosystem, vc, team, kol, launchpad, user;

  beforeEach(async function () {
    [owner, treasury, liquidity, ecosystem, vc, team, kol, launchpad, user] = await ethers.getSigners();
    const FIBToken = await ethers.getContractFactory("FIBToken");
    fibToken = await FIBToken.deploy(
      treasury.address, liquidity.address, ecosystem.address,
      vc.address, team.address, kol.address, launchpad.address
    );
  });

  it("should have correct total supply of 1 billion", async function () {
    const supply = await fibToken.totalSupply();
    expect(supply).to.equal(ethers.parseEther("1000000000"));
  });

  it("should distribute to correct allocations", async function () {
    expect(await fibToken.balanceOf(liquidity.address)).to.equal(ethers.parseEther("373100000"));
    expect(await fibToken.balanceOf(treasury.address)).to.equal(ethers.parseEther("222700000"));
    expect(await fibToken.balanceOf(ecosystem.address)).to.equal(ethers.parseEther("159300000"));
    expect(await fibToken.balanceOf(vc.address)).to.equal(ethers.parseEther("100000000"));
    expect(await fibToken.balanceOf(team.address)).to.equal(ethers.parseEther("53500000"));
    expect(await fibToken.balanceOf(kol.address)).to.equal(ethers.parseEther("53500000"));
    expect(await fibToken.balanceOf(launchpad.address)).to.equal(ethers.parseEther("38100000"));
  });

  it("should allow authorized burner to burn tokens", async function () {
    await fibToken.addBurner(owner.address);
    const burnAmount = ethers.parseEther("1000");
    await fibToken.connect(treasury).transfer(owner.address, burnAmount);
    await fibToken.protocolBurn(burnAmount);
    expect(await fibToken.totalBurned()).to.equal(burnAmount);
  });

  it("should reject burn from unauthorized address", async function () {
    await expect(fibToken.connect(user).protocolBurn(100))
      .to.be.revertedWithCustomError(fibToken, "NotAuthorizedBurner");
  });

  it("should return correct burned percentage", async function () {
    await fibToken.addBurner(owner.address);
    await fibToken.connect(treasury).transfer(owner.address, ethers.parseEther("10000000"));
    await fibToken.protocolBurn(ethers.parseEther("10000000"));
    expect(await fibToken.burnedPercentage()).to.equal(100); // 100 basis points = 1%
  });
});
// # NEVER commit .env to git

// # Your deployer wallet private key (without 0x prefix)
// PRIVATE_KEY=49aca91f3d5ccc8c2e1bedda7450010438242d831e291388694942159c54ac57

// # BaseScan API key for contract verification
// BASESCAN_API_KEY=HVXUJQFE8SD1C8ICQYQ52MSZW1GJ4F6JJZ

// # RPC URLs (optional — defaults are provided in hardhat.config.js)
// BASE_SEPOLIA_RPC=https://sepolia.base.org
// BASE_MAINNET_RPC=https://mainnet.base.org
