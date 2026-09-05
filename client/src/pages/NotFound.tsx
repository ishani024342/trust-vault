import { ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="site-shell notfound-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/brand/samvid-logo.png" alt="Samvid logo" />
          <strong>SAMVID</strong>
        </div>
        <nav><a className="console-link" href="/">Return to field <ArrowRight size={13} /></a></nav>
      </header>
      <main className="notfound-main">
        <div className="notfound-marker"><span className="rule" /> ROUTE UNRESOLVED / 404</div>
        <h1>No proof<br />at this <em>path.</em></h1>
        <p>The address you followed is not registered in the Samvid atlas. The identity, access, and ownership records live at the field entry.</p>
        <a className="primary-button notfound-action" href="/">Enter the proof field <ArrowRight size={16} /></a>
      </main>
      <footer>
        <div><strong>SAMVID</strong></div>
        <small>IDENTITY · ACCESS · OWNERSHIP</small>
        <small>© 2026 SAMVID</small>
      </footer>
    </div>
  );
}
