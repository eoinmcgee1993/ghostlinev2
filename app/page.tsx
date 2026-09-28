"use client";

import { useEffect, useState } from "react";

type EventRow = { id:string; agent_name:string; event_type:string; message:string; created_at:string };

export default function Home() {
  const [url,setUrl] = useState("");
  const [offerId,setOfferId] = useState("");
  const [events,setEvents] = useState<EventRow[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");

  useEffect(() => {
    if (!offerId) return;
    const source = new EventSource(`/api/events?offerId=${encodeURIComponent(offerId)}`);
    source.onmessage = e => { try { setEvents(prev => [...prev, JSON.parse(e.data)].slice(-200)); } catch {} };
    source.onerror = () => source.close();
    return () => source.close();
  }, [offerId]);

  async function launch() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/engine/initialize", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url}) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Launch failed");
      setOfferId(data.offerId);
    } catch(e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return <main>
    <div className="panel">
      <div className="muted">GHOSTLINE // V1 CORE</div>
      <h1>AUTONOMOUS REVENUE ENGINE</h1>
      <p className="muted">Mission control. Event-driven execution with leased workers, schema validation and human fallback.</p>
      <div className="row">
        <input className="grow" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://target.example" />
        <button disabled={busy || !url} onClick={launch}>{busy ? "INITIALIZING..." : "DEPLOY ENGINE"}</button>
      </div>
      {error && <p>{error}</p>}
    </div>
    <div className="panel">
      <div className="accent">LIVE EXECUTION CONSOLE</div>
      <pre>{events.length ? events.map(e => `[${e.created_at}] ${e.agent_name} :: ${e.event_type} :: ${e.message}`).join("\n") : "waiting for engine events..."}</pre>
    </div>
  </main>;
}
