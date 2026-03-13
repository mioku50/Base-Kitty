// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
}

contract DailyBlessingDistributor {
    uint8 public constant TASK_DAILY = 0;
    uint8 public constant TASK_STREAK = 1;
    uint8 public constant TASK_INVITE = 2;

    struct ClaimVoucher {
        address recipient;
        uint8 task;
        uint256 amount;
        uint256 validAfter;
        uint256 validBefore;
        uint256 nonce;
    }

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
    bytes32 private constant CLAIM_VOUCHER_TYPEHASH =
        keccak256(
            "ClaimVoucher(address recipient,uint8 task,uint256 amount,uint256 validAfter,uint256 validBefore,uint256 nonce)"
        );

    IERC20 public immutable rewardToken;
    string public constant NAME = "Nimbus Blessings";
    string public constant VERSION = "2";

    address public owner;
    address public signer;

    mapping(address => mapping(uint8 => uint64)) public lastClaimAtByTask;
    mapping(uint256 => bool) public usedNonces;
    mapping(bytes32 => bool) public usedDigests;

    event Claimed(
        address indexed user,
        uint8 indexed task,
        uint256 amount,
        uint256 timestamp,
        uint256 nonce
    );
    event SignerUpdated(address indexed newSigner);
    event OwnerUpdated(address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address token, address signer_) {
        require(token != address(0), "token=0");
        require(signer_ != address(0), "signer=0");

        rewardToken = IERC20(token);
        signer = signer_;
        owner = msg.sender;
    }

    function setSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "signer=0");
        signer = newSigner;
        emit SignerUpdated(newSigner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner=0");
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "to=0");
        require(rewardToken.transfer(to, amount), "transfer failed");
    }

    function nextClaimAt(address user, uint8 task) public view returns (uint256) {
        if (!_taskUsesCooldown(task)) return 0;
        uint256 last = lastClaimAtByTask[user][task];
        if (last == 0) return 0;
        return last + 1 days;
    }

    function taskUsesCooldown(uint8 task) external pure returns (bool) {
        return _taskUsesCooldown(task);
    }

    function nextClaimAt(address user) public view returns (uint256) {
        return nextClaimAt(user, TASK_DAILY);
    }

    function claim(ClaimVoucher calldata voucher, bytes calldata signature) external {
        require(msg.sender == voucher.recipient, "recipient mismatch");
        require(voucher.amount > 0, "amount=0");
        require(
            voucher.task == TASK_DAILY ||
                voucher.task == TASK_STREAK ||
                voucher.task == TASK_INVITE,
            "bad task"
        );
        require(block.timestamp >= voucher.validAfter, "voucher not active");
        require(block.timestamp <= voucher.validBefore, "voucher expired");

        if (_taskUsesCooldown(voucher.task)) {
            uint256 next = nextClaimAt(msg.sender, voucher.task);
            require(next == 0 || block.timestamp >= next, "cooldown active");
            lastClaimAtByTask[msg.sender][voucher.task] = uint64(block.timestamp);
        }

        require(!usedNonces[voucher.nonce], "nonce already used");
        usedNonces[voucher.nonce] = true;

        bytes32 digest = _digest(voucher);
        require(!usedDigests[digest], "voucher already used");
        usedDigests[digest] = true;

        address recovered = _recoverSigner(digest, signature);
        require(recovered == signer, "invalid signature");

        require(rewardToken.transfer(msg.sender, voucher.amount), "transfer failed");

        emit Claimed(msg.sender, voucher.task, voucher.amount, block.timestamp, voucher.nonce);
    }

    function _domainSeparatorV4() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    keccak256(bytes(NAME)),
                    keccak256(bytes(VERSION)),
                    block.chainid,
                    address(this)
                )
            );
    }

    function _hashVoucher(ClaimVoucher calldata voucher) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CLAIM_VOUCHER_TYPEHASH,
                    voucher.recipient,
                    voucher.task,
                    voucher.amount,
                    voucher.validAfter,
                    voucher.validBefore,
                    voucher.nonce
                )
            );
    }

    function _taskUsesCooldown(uint8 task) internal pure returns (bool) {
        if (task == TASK_DAILY) return true;
        if (task == TASK_STREAK) return true;
        if (task == TASK_INVITE) return false;
        revert("bad task");
    }

    function _digest(ClaimVoucher calldata voucher) internal view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked("\x19\x01", _domainSeparatorV4(), _hashVoucher(voucher))
            );
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature)
        internal
        pure
        returns (address)
    {
        require(signature.length == 65, "bad signature");

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) v += 27;
        require(v == 27 || v == 28, "bad v");

        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0), "bad signer");
        return recovered;
    }
}
