"use client";

import { useEffect, useState } from "react";

type Health = {
  ok: boolean;
  env: {
    NEXT_PUBLIC_BASE_URL: boolean;
    NEXT_PUBLIC_SUPABASE_URL: boolean;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: boolean;
    SUPABASE_SERVICE_ROLE: boolean;
    TOGETHER_API_KEY: boolean;
    TOGETHER_MODEL: string | null;
    TRANSCRIBE_URL: string | null;
    INGESTOR_URL: string | null;
  };
  timestamp: string;
};

function StatusRow({ label, ok, hint }: { label:string; ok:boolean; hint?:string }) {
  return (
    <div className="kv" style={{justifyContent:"space-between"}}>
      <span className="badge">{label}</span>
      <span className={ok ? "status-ok" : "status-bad"}>
        {ok ? "OK" : "Missing"} {hint ? <span style={{color:"var(--muted)"}}>• {hint}</span> : null}
      </span>
    </div>
  );
}

export default function Page() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const json = await res.json();
      setHealth(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";

  return (
    <main>
      <section className="hero">
        <div className="badge">Vercel • Next.js API • Supabase • Railway</div>
        <h1>Med Study Partner</h1>
        <p>
          Upload lecture PDFs, get structured blocks, summaries, practice items, and SRS scheduling.
          This landing page is a lightweight shell so Vercel can build; your main logic lives in <code>app/api/*</code>.
        </p>
        <div className="ctas">
          <button className="btn" onClick={refresh} disabled={loading}>
            {loading ? "Checking…" : "Run health check"}
          </button>
          <a className="btn ghost" href={`${baseUrl || "/" }api/lecture/upload`} target="_blank" rel="noreferrer">
            Open an API route
          </a>
        </div>
      </section>

      <section className="section">
        <div className="grid">
          <div className="card">
            <h3>Lecture → Summary</h3>
            <p>POST file to <code>/api/lecture/upload</code>, then summarize via <code>/api/lecture/summarize</code>.</p>
          </div>
          <div className="card">
            <h3>Materials → Questions</h3>
            <p>Upload with <code>/api/material/upload</code>, generate items at <code>/api/material/generate</code>.</p>
          </div>
          <div className="card">
            <h3>SRS Workflow</h3>
            <p>Bootstrap with <code>/api/srs/bootstrap</code>, then <code>/api/srs/next</code> and <code>/api/srs/review</code>.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <h3 style={{marginBottom:12}}>System status</h3>
        {!health ? (
          <div className="badge">Waiting for health…</div>
        ) : (
          <div className="grid">
            <div className="card" style={{gridColumn:"span 6"}}>
              <h3>Environment</h3>
              <div style={{display:"grid", gap:8}}>
                <StatusRow label="BASE_URL (public)" ok={health.env.NEXT_PUBLIC_BASE_URL} hint="NEXT_PUBLIC_BASE_URL" />
                <StatusRow label="Supabase URL (public)" ok={health.env.NEXT_PUBLIC_SUPABASE_URL} hint="NEXT_PUBLIC_SUPABASE_URL" />
                <StatusRow label="Supabase anon key (public)" ok={health.env.NEXT_PUBLIC_SUPABASE_ANON_KEY} hint="NEXT_PUBLIC_SUPABASE_ANON_KEY" />
                <StatusRow label="Service role (server)" ok={health.env.SUPABASE_SERVICE_ROLE} hint="SUPABASE_SERVICE_ROLE" />
                <StatusRow label="Together API key (server)" ok={health.env.TOGETHER_API_KEY} hint="TOGETHER_API_KEY" />
                <div className="kv" style={{justifyContent:"space-between"}}>
                  <span className="badge">Together model</span>
                  <span className={health.env.TOGETHER_MODEL ? "status-ok" : "status-warn"}>
                    {health.env.TOGETHER_MODEL || "not set"}
                  </span>
                </div>
              </div>
            </div>

            <div className="card" style={{gridColumn:"span 6"}}>
              <h3>Workers</h3>
              <div style={{display:"grid", gap:8}}>
                <div className="kv" style={{justifyContent:"space-between"}}>
                  <span className="badge">TRANSCRIBE_URL</span>
                  <a href={health.env.TRANSCRIBE_URL || "#"} target="_blank" className={health.env.TRANSCRIBE_URL ? "status-ok" : "status-bad"}>
                    {health.env.TRANSCRIBE_URL || "not set"}
                  </a>
                </div>
                <div className="kv" style={{justifyContent:"space-between"}}>
                  <span className="badge">INGESTOR_URL</span>
                  <a href={health.env.INGESTOR_URL || "#"} target="_blank" className={health.env.INGESTOR_URL ? "status-ok" : "status-bad"}>
                    {health.env.INGESTOR_URL || "not set"}
                  </a>
                </div>
                <div className="kv" style={{justifyContent:"space-between"}}>
                  <span className="badge">Last check</span>
                  <span className="status-ok">{new Date(health.timestamp).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
