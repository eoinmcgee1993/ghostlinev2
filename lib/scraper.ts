import { pinAndValidateSsrfUrl } from "./ssrf";

export async function fetchWebsiteContent(targetUrl: string): Promise<string> {
  const pinned = await pinAndValidateSsrfUrl(targetUrl);
  try {
    const response = await fetch(pinned.url, {
      method: "GET",
      headers: {
        "User-Agent": "GhostlineEngine/1.0",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9"
      },
      signal: AbortSignal.timeout(8000),
      dispatcher: pinned.dispatcher as never
    } as RequestInit);
    if (!response.ok) throw new Error(`SCRAPER_HTTP_${response.status}`);
    const html = (await response.text()).slice(0, 500_000);
    return html.replace(/<script\b[^<]*>[\s\S]*?<\/script>/gi," ")
      .replace(/<style\b[^<]*>[\s\S]*?<\/style>/gi," ")
      .replace(/<noscript\b[^<]*>[\s\S]*?<\/noscript>/gi," ")
      .replace(/<[^>]+>/g," ")
      .replace(/&nbsp;/gi," ")
      .replace(/&amp;/gi,"&")
      .replace(/\s+/g," ").trim().slice(0,6000);
  } finally {
    await pinned.dispatcher.close();
  }
}
