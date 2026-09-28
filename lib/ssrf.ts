import dns from "node:dns/promises";
import net from "node:net";

function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a,b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:");
}

export async function pinAndValidateSsrfUrl(raw: string): Promise<{ url: URL; address: string }> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("INVALID_TARGET_URL");
  if (url.username || url.password) throw new Error("INVALID_TARGET_URL");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(x => privateIp(x.address))) throw new Error("SSRF_BLOCKED");
  return { url, address: addresses[0].address };
}
