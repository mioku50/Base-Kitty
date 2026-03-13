import { randomUUID } from "node:crypto";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const BASE_CHAIN_ID = 8453;
const CLAIM_COOLDOWN_SECONDS = 24 * 60 * 60;
const CLAIM_VOUCHER_TTL_SECONDS = 10 * 60;
const PRICE_CACHE_MS = 5 * 60 * 1000;
const DEFAULT_STREAK_REWARD_RAW = BigInt("1000000000000000000");
const DEFAULT_INVITE_REWARD_RAW = BigInt("2000000000000000000");

const EIP712_NAME = "Nimbus Blessings";
const EIP712_VERSION = "2";

export type BlessingTask = "daily" | "streak" | "invite";

const TASK_ID = {
  daily: 0,
  streak: 1,
  invite: 2,
} as const;

const claimAbi = parseAbi([
  "function claim((address recipient,uint8 task,uint256 amount,uint256 validAfter,uint256 validBefore,uint256 nonce) voucher, bytes signature)",
  "function nextClaimAt(address user) view returns (uint256)",
  "function nextClaimAt(address user, uint8 task) view returns (uint256)",
  "function usedNonces(uint256 nonce) view returns (bool)",
]);

const erc20Abi = parseAbi(["function decimals() view returns (uint8)"]);

type ClaimConfig = {
  baseRpcUrl: string;
  claimContractAddress: Address;
  degenTokenAddress: Address;
  signerPrivateKey: `0x${string}`;
  dailyRewardAmountRaw: bigint;
  streakRewardAmountRaw: bigint;
  inviteRewardAmountRaw: bigint;
};

export type ClaimVoucher = {
  recipient: Address;
  task: number;
  amount: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: bigint;
};

export type SignedClaim = {
  voucher: ClaimVoucher;
  signature: `0x${string}`;
  calldata: `0x${string}`;
};

type PriceSnapshot = {
  ethUsd: number;
  degenUsd: number;
  tokenDecimals: number;
  updatedAt: number;
};

let publicClientCache: { rpc: string; client: PublicClient } | null = null;
let priceCache: PriceSnapshot | null = null;

const claimVoucherTypes = {
  ClaimVoucher: [
    { name: "recipient", type: "address" },
    { name: "task", type: "uint8" },
    { name: "amount", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

function mustEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function parseRawAmount(value: string, envName: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${envName} must be an integer string`);
  }

  if (parsed <= BigInt(0)) {
    throw new Error(`${envName} must be greater than 0`);
  }

  return parsed;
}

function asAddress(value: string, label: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${label} is not a valid EVM address`);
  }
  return value;
}

function asPrivateKey(value: string): `0x${string}` {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("CLAIM_SIGNER_PRIVATE_KEY must be a 32-byte hex private key");
  }
  return normalized as `0x${string}`;
}

function getConfig(): ClaimConfig {
  const dailyRaw = parseRawAmount(
    mustEnv("DAILY_BLESSING_AMOUNT_RAW"),
    "DAILY_BLESSING_AMOUNT_RAW"
  );
  const streakRaw = parseRawAmount(
    process.env.STREAK_BLESSING_AMOUNT_RAW?.trim() || String(DEFAULT_STREAK_REWARD_RAW),
    "STREAK_BLESSING_AMOUNT_RAW"
  );
  const inviteRaw = parseRawAmount(
    process.env.INVITE_BLESSING_AMOUNT_RAW?.trim() || String(DEFAULT_INVITE_REWARD_RAW),
    "INVITE_BLESSING_AMOUNT_RAW"
  );

  return {
    baseRpcUrl: mustEnv("BASE_RPC_URL"),
    claimContractAddress: asAddress(mustEnv("CLAIM_CONTRACT_ADDRESS"), "CLAIM_CONTRACT_ADDRESS"),
    degenTokenAddress: asAddress(mustEnv("DEGEN_TOKEN_ADDRESS"), "DEGEN_TOKEN_ADDRESS"),
    signerPrivateKey: asPrivateKey(mustEnv("CLAIM_SIGNER_PRIVATE_KEY")),
    dailyRewardAmountRaw: dailyRaw,
    streakRewardAmountRaw: streakRaw,
    inviteRewardAmountRaw: inviteRaw,
  };
}

function getPublicClient(baseRpcUrl: string): PublicClient {
  if (publicClientCache?.rpc === baseRpcUrl) {
    return publicClientCache.client;
  }

  const client = createPublicClient({
    transport: http(baseRpcUrl),
  });

  publicClientCache = {
    rpc: baseRpcUrl,
    client,
  };

  return client;
}

function makeNonceBigInt(): bigint {
  return BigInt(`0x${randomUUID().replace(/-/g, "")}`);
}

function formatRewardLabel(amountRaw: bigint) {
  const amount = formatUnits(amountRaw, 18).replace(/\.0+$/, "");
  return `${amount} $DEGEN`;
}

function getTaskId(task: BlessingTask) {
  return TASK_ID[task];
}

function getTaskRewardRawFromConfig(config: ClaimConfig, task: BlessingTask) {
  if (task === "daily") return config.dailyRewardAmountRaw;
  if (task === "streak") return config.streakRewardAmountRaw;
  return config.inviteRewardAmountRaw;
}

export function isAddressLike(value: string | null | undefined): value is Address {
  return Boolean(value && isAddress(value));
}

export function claimCooldownSeconds() {
  return CLAIM_COOLDOWN_SECONDS;
}

export function getBaseChainId() {
  return BASE_CHAIN_ID;
}

export function getClaimTxTarget() {
  return getConfig().claimContractAddress;
}

export function getTaskRewardAmountRaw(task: BlessingTask) {
  const config = getConfig();
  return getTaskRewardRawFromConfig(config, task);
}

export function getTaskRewardLabel(task: BlessingTask) {
  return formatRewardLabel(getTaskRewardAmountRaw(task));
}

export function getRewardAmountRaw() {
  return getTaskRewardAmountRaw("daily");
}

export function getRewardLabel() {
  return getTaskRewardLabel("daily");
}

export function isRunWithin24Hours(lastPlayedAtMs: number | null, nowMs = Date.now()) {
  if (!lastPlayedAtMs || !Number.isFinite(lastPlayedAtMs)) return false;
  return nowMs - lastPlayedAtMs <= CLAIM_COOLDOWN_SECONDS * 1000;
}

export function buildInviteNonce(referrerFid: number, referredFid: number): bigint {
  const prefix = BigInt(2) << BigInt(248);
  const mask = (BigInt(1) << BigInt(120)) - BigInt(1);
  const referrerPart = (BigInt(referrerFid) & mask) << BigInt(120);
  const referredPart = BigInt(referredFid) & mask;
  return prefix | referrerPart | referredPart;
}

export async function isClaimNonceUsed(nonce: bigint): Promise<boolean> {
  const config = getConfig();
  const client = getPublicClient(config.baseRpcUrl);

  return client.readContract({
    address: config.claimContractAddress,
    abi: claimAbi,
    functionName: "usedNonces",
    args: [nonce],
  });
}

export async function findFirstAvailableInviteNonce(
  referrerFid: number,
  referredFids: number[]
): Promise<{ nonce: bigint | null; availableCount: number }> {
  const filtered = [...new Set(referredFids.filter((fid) => Number.isInteger(fid) && fid > 0))].slice(
    0,
    64
  );
  if (filtered.length === 0) {
    return { nonce: null, availableCount: 0 };
  }

  const config = getConfig();
  const client = getPublicClient(config.baseRpcUrl);
  const nonces = filtered.map((referredFid) => buildInviteNonce(referrerFid, referredFid));

  const results = await client.multicall({
    allowFailure: true,
    contracts: nonces.map((nonce) => ({
      address: config.claimContractAddress,
      abi: claimAbi,
      functionName: "usedNonces",
      args: [nonce],
    })),
  });

  let first: bigint | null = null;
  let availableCount = 0;

  results.forEach((result, index) => {
    if (result.status !== "success") return;
    const used = Boolean(result.result);
    if (!used) {
      availableCount += 1;
      if (first === null) {
        first = nonces[index] ?? null;
      }
    }
  });

  return { nonce: first, availableCount };
}

export async function getNextClaimAt(walletAddress: Address, task: BlessingTask = "daily"): Promise<number> {
  const config = getConfig();
  const client = getPublicClient(config.baseRpcUrl);

  try {
    const nextClaimAt = await client.readContract({
      address: config.claimContractAddress,
      abi: claimAbi,
      functionName: "nextClaimAt",
      args: [walletAddress, getTaskId(task)],
    });

    return Number(nextClaimAt);
  } catch (error) {
    if (task !== "daily") {
      throw error;
    }

    const fallback = await client.readContract({
      address: config.claimContractAddress,
      abi: claimAbi,
      functionName: "nextClaimAt",
      args: [walletAddress],
    });
    return Number(fallback);
  }
}

export async function buildSignedClaim(
  walletAddress: Address,
  task: BlessingTask = "daily",
  nonceOverride?: bigint
): Promise<SignedClaim> {
  const config = getConfig();
  const signer = privateKeyToAccount(config.signerPrivateKey);
  const nowSec = Math.floor(Date.now() / 1000);
  const taskId = getTaskId(task);

  const voucher: ClaimVoucher = {
    recipient: walletAddress,
    task: taskId,
    amount: getTaskRewardRawFromConfig(config, task),
    validAfter: BigInt(Math.max(0, nowSec - 30)),
    validBefore: BigInt(nowSec + CLAIM_VOUCHER_TTL_SECONDS),
    nonce: nonceOverride ?? makeNonceBigInt(),
  };

  const signature = await signer.signTypedData({
    domain: {
      name: EIP712_NAME,
      version: EIP712_VERSION,
      chainId: BASE_CHAIN_ID,
      verifyingContract: config.claimContractAddress,
    },
    primaryType: "ClaimVoucher",
    types: claimVoucherTypes,
    message: voucher,
  });

  const calldata = encodeFunctionData({
    abi: claimAbi,
    functionName: "claim",
    args: [voucher, signature],
  });

  return {
    voucher,
    signature,
    calldata,
  };
}

export async function estimateClaimGas(walletAddress: Address, calldata: `0x${string}`): Promise<bigint> {
  const config = getConfig();
  const client = getPublicClient(config.baseRpcUrl);

  return client.estimateGas({
    account: walletAddress,
    to: config.claimContractAddress,
    value: BigInt(0),
    data: calldata,
  });
}

export async function getCurrentGasPriceWei(): Promise<bigint> {
  const config = getConfig();
  const client = getPublicClient(config.baseRpcUrl);
  return client.getGasPrice();
}

async function loadUsdPrices(config: ClaimConfig): Promise<PriceSnapshot> {
  const now = Date.now();
  if (priceCache && now - priceCache.updatedAt < PRICE_CACHE_MS) {
    return priceCache;
  }

  const client = getPublicClient(config.baseRpcUrl);
  const tokenDecimals = Number(
    await client.readContract({
      address: config.degenTokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    })
  );

  const [ethResponse, degenResponse] = await Promise.all([
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"),
    fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${config.degenTokenAddress}&vs_currencies=usd`
    ),
  ]);

  if (!ethResponse.ok || !degenResponse.ok) {
    throw new Error("Price API request failed");
  }

  const ethJson = (await ethResponse.json()) as { ethereum?: { usd?: number } };
  const degenJson = (await degenResponse.json()) as Record<string, { usd?: number }>;

  const ethUsd = Number(ethJson.ethereum?.usd);
  const degenUsd = Number(degenJson[config.degenTokenAddress.toLowerCase()]?.usd);

  if (!Number.isFinite(ethUsd) || ethUsd <= 0) {
    throw new Error("ETH/USD price is unavailable");
  }

  if (!Number.isFinite(degenUsd) || degenUsd <= 0) {
    throw new Error("DEGEN/USD price is unavailable");
  }

  priceCache = {
    ethUsd,
    degenUsd,
    tokenDecimals,
    updatedAt: now,
  };

  return priceCache;
}

export async function calculateClaimEconomics(params: {
  task?: BlessingTask;
  gasEstimate: bigint;
  gasPriceWei: bigint;
}) {
  const config = getConfig();
  const prices = await loadUsdPrices(config);
  const task = params.task ?? "daily";
  const rewardRaw = getTaskRewardRawFromConfig(config, task);

  const rewardAmountDegen = Number(formatUnits(rewardRaw, prices.tokenDecimals));
  const gasCostEth = Number(formatEther(params.gasEstimate * params.gasPriceWei));

  const rewardUsd = rewardAmountDegen * prices.degenUsd;
  const estimatedGasUsd = gasCostEth * prices.ethUsd;

  if (!Number.isFinite(rewardUsd) || rewardUsd <= 0) {
    throw new Error("Reward USD value is unavailable");
  }

  if (!Number.isFinite(estimatedGasUsd) || estimatedGasUsd < 0) {
    throw new Error("Gas USD estimate failed");
  }

  return {
    rewardUsd,
    estimatedGasUsd,
    degenUsd: prices.degenUsd,
    ethUsd: prices.ethUsd,
    tokenDecimals: prices.tokenDecimals,
  };
}
