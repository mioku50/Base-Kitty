// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
}

contract DailyBlessingDistributor {
    struct ClaimVoucher {
        address recipient;
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
            "ClaimVoucher(address recipient,uint256 amount,uint256 validAfter,uint256 validBefore,uint256 nonce)"
        );

    IERC20 public immutable rewardToken;
    uint256 public immutable rewardAmount;
    string public constant NAME = "Nimbus Daily Blessing";
    string public constant VERSION = "1";

    address public owner;
    address public signer;

    mapping(address => uint64) public lastClaimAt;
    mapping(bytes32 => bool) public usedDigests;

    event Claimed(address indexed user, uint256 amount, uint256 timestamp, uint256 nonce);
    event SignerUpdated(address indexed newSigner);
    event OwnerUpdated(address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address token, address signer_, uint256 rewardAmount_) {
        require(token != address(0), "token=0");
        require(signer_ != address(0), "signer=0");
        require(rewardAmount_ > 0, "reward=0");

        rewardToken = IERC20(token);
        signer = signer_;
        owner = msg.sender;
        rewardAmount = rewardAmount_;
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

    function nextClaimAt(address user) public view returns (uint256) {
        uint256 last = lastClaimAt[user];
        if (last == 0) return 0;
        return last + 1 days;
    }

    function claim(ClaimVoucher calldata voucher, bytes calldata signature) external {
        require(msg.sender == voucher.recipient, "recipient mismatch");
        require(voucher.amount == rewardAmount, "amount mismatch");
        require(block.timestamp >= voucher.validAfter, "voucher not active");
        require(block.timestamp <= voucher.validBefore, "voucher expired");

        uint256 next = nextClaimAt(msg.sender);
        require(next == 0 || block.timestamp >= next, "cooldown active");

        bytes32 digest = _digest(voucher);
        require(!usedDigests[digest], "voucher already used");
        usedDigests[digest] = true;

        address recovered = _recoverSigner(digest, signature);
        require(recovered == signer, "invalid signature");

        lastClaimAt[msg.sender] = uint64(block.timestamp);
        require(rewardToken.transfer(msg.sender, voucher.amount), "transfer failed");

        emit Claimed(msg.sender, voucher.amount, block.timestamp, voucher.nonce);
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
                    voucher.amount,
                    voucher.validAfter,
                    voucher.validBefore,
                    voucher.nonce
                )
            );
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
