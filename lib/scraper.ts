import { pinAndValidateSsrfUrl } from "./ssrf";

export async function fetchWebsiteContent(targetUrl:string):Promise<string> {
 let current=targetUrl;
 for(let attempt=0;attempt<4;attempt++){
  const pinned=await pinAndValidateSsrfUrl(current);
  try{
   const response=await fetch(pinned.url,{
    method:"GET",
    headers:{"User-Agent":"GhostlineEngine/1.0","Accept":"text/html,application/xhtml+xml,text/plain;q=0.9"},
    signal:AbortSignal.timeout(8000),
    redirect:"manual",
    dispatcher:pinned.dispatcher as never
   } as RequestInit);
   if(response.status>=300 && response.status<400){
    const location=response.headers.get("location");
    if(!location) throw new Error("SCRAPER_REDIRECT_WITHOUT_LOCATION");
    current=new URL(location,pinned.url).toString();
    continue;
   }
   if(!response.ok) throw new Error(`SCRAPER_HTTP_${response.status}`);
   const html=(await response.text()).slice(0,500_000);
   return html.replace(/<script\b[^<]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^<]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<noscript\b[^<]*>[\s\S]*?<\/noscript>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&")
    .replace(/\s+/g," ").trim().slice(0,6000);
  } finally { await pinned.dispatcher.close(); }
 }
 throw new Error("SCRAPER_TOO_MANY_REDIRECTS");
}
