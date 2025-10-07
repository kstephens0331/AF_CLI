export const metadata = {
  title: "AF CLI — Med Study Partner",
  description: "LLM-backed API routes + utilities deployed on Vercel",
};

import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <nav className="nav">
            <div className="logo">🧭 AF CLI • Med Study Partner</div>
            <div style={{display:"flex",gap:12}}>
              <a href="https://github.com/kstephens0331/AF_CLI" target="_blank">GitHub</a>
              <a href="/api/health" target="_blank">Health JSON</a>
            </div>
          </nav>
          {children}
          <footer className="footer">
            Built with Next.js API routes, Supabase, Railway workers, and Together AI.
          </footer>
        </div>
      </body>
    </html>
  );
}
