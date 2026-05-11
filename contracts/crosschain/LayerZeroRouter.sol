// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title LayerZeroRouter
 * @notice Handles cross-chain slot messaging via LayerZero
 * @dev When a slot has destChainId > 0, SlottingEngine calls this router.
 *      Router sends cross-chain message to destination chain's SlottingEngine
 *      which then fulfills the slot from the pool on that chain.
 *
 *      Integrates with LayerZero V2 OApp messaging standard.
 */
contract LayerZeroRouter is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant SLOTTING_ENGINE_ROLE = keccak256("SLOTTING_ENGINE_ROLE");
    bytes32 public constant LZ_ENDPOINT_ROLE     = keccak256("LZ_ENDPOINT_ROLE");

    // LayerZero endpoint on this chain
    address public lzEndpoint;

    // Chain ID mappings: our chainId → LayerZero endpoint ID
    mapping(uint32 => uint32) public chainToLzEid;

    // Trusted remote routers on other chains
    mapping(uint32 => address) public trustedRemotes;

    // Slot message types
    uint8 public constant MSG_SLOT_REQUEST  = 1;
    uint8 public constant MSG_SLOT_FILL     = 2;
    uint8 public constant MSG_SLOT_REFUND   = 3;

    struct CrossChainSlot {
        uint256 slotId;
        address user;
        address tokenIn;
        uint256 amountIn;
        address tokenOut;
        uint256 amountOut;
        address recipient;
        uint256 feeAmount;
        uint32  srcChainId;
        uint32  destChainId;
    }

    mapping(bytes32 => CrossChainSlot) public pendingCrossChainSlots;
    mapping(bytes32 => bool)           public processedMessages;

    event CrossChainSlotSent(
        bytes32 indexed msgHash,
        uint256 slotId,
        uint32  destChainId,
        address tokenOut,
        uint256 amountOut,
        address recipient
    );
    event CrossChainSlotReceived(
        bytes32 indexed msgHash,
        uint256 slotId,
        uint32  srcChainId,
        address tokenOut,
        uint256 amountOut,
        address recipient
    );
    event CrossChainSlotFulfilled(bytes32 indexed msgHash, address recipient, uint256 amount);
    event TrustedRemoteSet(uint32 chainId, address remote);
    event ChainMapped(uint32 chainId, uint32 lzEid);

    constructor(address _lzEndpoint) {
        require(_lzEndpoint != address(0), "Router: zero endpoint");
        lzEndpoint = _lzEndpoint;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(LZ_ENDPOINT_ROLE,  _lzEndpoint);
    }

    // ─────────────────────────────────────────────
    // SEND — cross-chain slot request
    // ─────────────────────────────────────────────

    /**
     * @notice Send a cross-chain slot request to destination chain
     * @dev Called by SlottingEngine when destChainId > 0
     */
    function sendSlotRequest(
        uint256 slotId,
        address user,
        address tokenOut,
        uint256 amountOut,
        address recipient,
        uint32  destChainId
    ) external payable onlyRole(SLOTTING_ENGINE_ROLE) nonReentrant {
        require(trustedRemotes[destChainId] != address(0), "Router: no trusted remote");

        bytes memory payload = abi.encode(
            MSG_SLOT_REQUEST,
            slotId,
            user,
            tokenOut,
            amountOut,
            recipient,
            block.chainid,
            destChainId
        );

        bytes32 msgHash = keccak256(payload);
        pendingCrossChainSlots[msgHash] = CrossChainSlot({
            slotId:      slotId,
            user:        user,
            tokenIn:     address(0),
            amountIn:    0,
            tokenOut:    tokenOut,
            amountOut:   amountOut,
            recipient:   recipient,
            feeAmount:   0,
            srcChainId:  uint32(block.chainid),
            destChainId: destChainId
        });

        // In production: call lzEndpoint.send{value: msg.value}(...)
        // For testnet: emit event for off-chain relayer to pick up
        emit CrossChainSlotSent(msgHash, slotId, destChainId, tokenOut, amountOut, recipient);
    }

    // ─────────────────────────────────────────────
    // RECEIVE — handle incoming cross-chain message
    // ─────────────────────────────────────────────

    /**
     * @notice Receive and process a cross-chain slot message from LayerZero
     * @dev In production: called by LZ endpoint after message verification
     */
    function lzReceive(
        uint32  srcEid,
        bytes   calldata,
        bytes32 guid,
        address,
        bytes   calldata message
    ) external onlyRole(LZ_ENDPOINT_ROLE) nonReentrant {
        require(!processedMessages[guid], "Router: already processed");
        processedMessages[guid] = true;

        (
            uint8   msgType,
            uint256 slotId,
            address user,
            address tokenOut,
            uint256 amountOut,
            address recipient,
            uint32  srcChainId,
        ) = abi.decode(message, (uint8, uint256, address, address, uint256, address, uint32, uint32));

        if (msgType == MSG_SLOT_REQUEST) {
            emit CrossChainSlotReceived(guid, slotId, srcChainId, tokenOut, amountOut, recipient);
            // SlottingEngine on this chain handles fulfillment
            // This triggers the local pool to release tokenOut to recipient
        }
    }

    // ─────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────

    function setTrustedRemote(uint32 chainId, address remote) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(remote != address(0), "Router: zero remote");
        trustedRemotes[chainId] = remote;
        emit TrustedRemoteSet(chainId, remote);
    }

    function mapChainToLzEid(uint32 chainId, uint32 lzEid) external onlyRole(DEFAULT_ADMIN_ROLE) {
        chainToLzEid[chainId] = lzEid;
        emit ChainMapped(chainId, lzEid);
    }

    function updateEndpoint(address _endpoint) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_endpoint != address(0), "Router: zero endpoint");
        lzEndpoint = _endpoint;
    }

    receive() external payable {}
}
