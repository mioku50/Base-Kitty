export type HexAddress = `0x${string}`;

export type WalletSignInMessageParts = {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: string;
};

const HEADER = "Nimbus Ascent wallet sign-in";
const DISCLAIMER =
  "This signature only proves wallet ownership and does not trigger a blockchain transaction.";

export function normalizeHexAddress(value: string | null | undefined): HexAddress | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) return null;
  return normalized as HexAddress;
}

export function buildWalletSignInMessage(parts: WalletSignInMessageParts): string {
  const address = normalizeHexAddress(parts.address) ?? parts.address.trim().toLowerCase();
  return [
    HEADER,
    `Domain: ${parts.domain.trim().toLowerCase()}`,
    `Address: ${address}`,
    `Nonce: ${parts.nonce.trim()}`,
    `Issued At: ${parts.issuedAt.trim()}`,
    "",
    DISCLAIMER,
  ].join("\n");
}

export function parseWalletSignInMessage(
  message: string
): WalletSignInMessageParts | null {
  if (!message || typeof message !== "string") return null;

  const match = message.match(
    /^Nimbus Ascent wallet sign-in\nDomain: ([^\n]+)\nAddress: ([^\n]+)\nNonce: ([^\n]+)\nIssued At: ([^\n]+)\n\nThis signature only proves wallet ownership and does not trigger a blockchain transaction\.$/m
  );
  if (!match) return null;

  const domain = match[1]?.trim().toLowerCase() || "";
  const address = match[2]?.trim().toLowerCase() || "";
  const nonce = match[3]?.trim() || "";
  const issuedAt = match[4]?.trim() || "";

  if (!domain || !address || !nonce || !issuedAt) return null;

  return { domain, address, nonce, issuedAt };
}
