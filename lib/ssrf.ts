import dns from "node:dns/promises";
import net from "node:net";
import { Agent } from "undici";

function normalizeIp(ip: string): string {
  const lower = ip.toLowerCase();
  return lower.startsWith("::ffff:") ? lower.slice(7) : ip;
}

function isPrivateIp(rawIp: string): boolean {
  const ip = normalizeIp(rawIp);
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === "::" || lower === "::1" ||
      lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }
  return true;
}

export interface PinnedRequestDetails {
  url: URL;
  address: string;
  dispatcher: Agent;
}

export async function pinAndValidateSsrfUrl(raw: string): Promise<PinnedRequestDetails> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("INVALID_TARGET_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("INVALID_TARGET_URL");
  if (url.username || url.password) throw new Error("INVALID_TARGET_URL");

  const resolved = await dns.lookup(url.hostname, { all: true });
  if (!resolved.length || resolved.some(entry => isPrivateIp(entry.address))) {
    throw new Error("SSRF_BLOCKED");
  }

  const address = normalizeIp(resolved[0].address);
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname: string, _options: unknown, callback: (err: Error | null, address?: string, family?: number) => void) => {
        callback(null, address, net.isIPv6(address) ? 6 : 4);
      }
    }
  });

  return { url, address, dispatcher };
}
