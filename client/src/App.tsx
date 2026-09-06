/* Samvid ground-truth style: editorial cream surface, dark teal proof field, motion communicates auditable system state. */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ChevronRight, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IdentityScene } from "./components/IdentityScene";
import { RoleConsole } from "./components/RoleConsole";
import NotFound from "./pages/NotFound";
import { clearSession, getSession, getToken, setSession, type Session } from "./lib/auth";
import { api, isRemote } from "./lib/api";
import { AssetDocument } from "./components/AssetDocument";

const nodes = [
  ["01", "DID", "decentralized identifier", "did"],
  ["02", "NFT", "asset ownership", "nft"],
  ["03", "RBAC", "role permissions", "rbac"],
  ["04", "CONTRACT", "on-chain rules", "contract"],
  ["05", "LEDGER", "audit trail", "ledger"],
  ["06", "PROOF", "cryptographic auth", "proof"],
] as const;

const roles = [
  ["A", "Admin", "Overview · Identities · Assets"],
  ["M", "Manager", "Overview · Access control · Assets"],
  ["R", "Auditor", "Overview · Blockchain · Audit trail"],
  ["U", "User", "Overview · My identity · My documents"],
] as const;

const consoleRoles = ["user", "manager", "admin", "auditor"] as const;

function useReferenceShield(active: boolean) {
  const [frame, setFrame] = useState({ progress: 0, pulse: 0, time: 0 });
  const previous = useRef(active);
  const values = useRef({ progress: 0, pulse: 0, last: performance.now() });

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const delta = Math.min((now - values.current.last) / 1000, 0.05);
      values.current.last = now;
      if (active !== previous.current) {
        previous.current = active;
        if (active) values.current.pulse = 0.001;
      }
      values.current.progress += ((active ? 1 : 0) - values.current.progress) * (1 - Math.exp(-7 * delta));
      if (values.current.pulse > 0) {
        values.current.pulse += delta * 1.6;
        if (values.current.pulse >= 1) values.current.pulse = 0;
      }
      setFrame({ progress: values.current.progress, pulse: values.current.pulse, time: now / 1000 });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const settle = active ? 1 + Math.sin(frame.progress * Math.PI) * 0.12 : 1;
  return { ...frame, auraScale: Math.max(0.001, frame.progress * 1.45 * settle), pulseScale: 0.4 + frame.pulse * 2.6, pulseOpacity: (1 - frame.pulse) * 0.55 };
}

function ProofField({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const shield = useReferenceShield(active);
  const shieldStyle = { "--shield-progress": shield.progress, "--aura-scale": shield.auraScale, "--pulse-scale": shield.pulseScale, "--pulse-opacity": shield.pulseOpacity, "--wire-tilt": `${Math.sin(shield.time * 0.4) * 0.08}rad`, "--wire-turn": `${shield.time * 0.25}rad` } as React.CSSProperties;
  return (
    <div className={`proof-field ${active ? "active" : ""}`}>
      <img className="proof-texture" src="/manus-storage/trustvault-proof-field_2121ea41.png" alt="" />
      <img className="orbit-accent" src="/manus-storage/trustvault-orbit-accent_abc24278.png" alt="" />
      <div className="proof-stars" aria-hidden="true">{Array.from({ length: 26 }, (_, i) => <i key={i} style={{ ["--x" as string]: `${(i * 37) % 101}%`, ["--y" as string]: `${(i * 53) % 88}%`, ["--d" as string]: `${(i % 7) * 0.7}s` }} />)}</div>
      <div className="proof-horizon" /><div className="proof-orbit orbit-wide" /><div className="proof-orbit orbit-mid" /><div className="proof-orbit orbit-tight" /><div className="proof-sphere" />
      {nodes.map(([num, label, detail, position], index) => <div className={`proof-node ${position}`} key={label}><span className="proof-node-dot">{num}</span><span><strong>{label}</strong><small>{detail}</small></span><div className="proof-connector" style={{ ["--angle" as string]: `${index * 53 - 20}deg` }} /></div>)}
      <button className="samvid-core-button" onClick={onToggle} aria-label={active ? "Seal the Samvid shield" : "Raise the Samvid shield"}>
        <span className="humanoid" aria-label="Samvid humanoid">
          <span className="humanoid-aura" /><span className="humanoid-body"><span className="humanoid-lower" /><span className="humanoid-screen">00</span><span className="humanoid-core"><i /><i /></span><span className="humanoid-arm left" /><span className="humanoid-arm right" /></span><span className="humanoid-head"><span className="humanoid-helmet" /><span className="humanoid-eye left" /><span className="humanoid-eye right" /><span className="humanoid-antenna left" /><span className="humanoid-antenna right" /></span>
        </span>
        <span className="shield-core" style={shieldStyle} aria-hidden="true"><span className="shield-aura" /><span className="shield-wire" /><span className="shield-pulse" /></span>
      </button>
      <div className="proof-state"><span className="state-dot" />{active ? "SHIELD ACTIVE · IDENTITY FIELD UNSEALED" : "SAMVID IDLE · FIELD SEALED"}</div>
      <button className="shield-control" onClick={onToggle}>{active ? "Seal shield" : "Raise shield"}<ArrowRight size={13} /></button>
      <div className="proof-caption">{active ? "TAP SAMVID TO SEAL ITS SHIELD" : "TAP SAMVID TO RAISE ITS SHIELD"}</div>
    </div>
  );
}

function RoleModal({ onClose, startStep }: { onClose: () => void; startStep: "register" | "login" }) {
  const [step, setStep] = useState<"register" | "login" | "role">(startStep);
  const [selected, setSelected] = useState("User");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const routeToRole = (roleValue: string) => { const role = roleValue.toLowerCase(); const slug = role === "admin" ? "admin" : role === "auditor" ? "auditor" : role === "manager" ? "manager" : "user"; window.location.href = `/console/${slug}`; };
  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      if (isRemote) {
        // The backend registers the account and returns the JWT + user (role included).
        await api.register({ name: form.name, email: form.email, password: form.password, role: "USER" });
        routeToRole(getSession()?.role ?? "USER");
        return;
      }
      localStorage.setItem("trustvault.pendingRegistration", JSON.stringify({ name: form.name, email: form.email }));
      setStep("role");
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Registration failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await api.login(form.email, form.password); routeToRole(getSession()?.role ?? "USER"); }
    catch (loginError) { setError(loginError instanceof Error ? loginError.message : "Login failed. Please try again."); }
    finally { setBusy(false); }
  };
  const continueToConsole = () => { const pending = localStorage.getItem("trustvault.pendingRegistration"); const parsed = pending ? JSON.parse(pending) as { name?: string; email: string } : null; setSessionLocal(selected, parsed); routeToRole(selected); };
  const setSessionLocal = (roleValue: string, pending: { name?: string; email: string } | null) => {
    const email = pending?.email ?? form.email;
    const role = roleValue.toUpperCase();
    localStorage.setItem("trustvault.session", JSON.stringify({ name: pending?.name, email, role, preview: true, local: true }));
  };
  return <div className="role-overlay" role="dialog" aria-modal="true" aria-labelledby="role-title">
    <div className="role-modal registration-modal">
      <button className="close-button" onClick={onClose} aria-label="Close account dialog"><X size={18} /></button>
      {step === "login" ? <>
        <div className="modal-kicker"><span className="rule" /> TRUSTED ENTRY</div>
        <h2 id="role-title">Log in to Samvid</h2>
        <p>Use the account credentials returned by the authentication service to enter your role console.</p>
        <div className="flow-tabs"><span className="active">LOG IN</span><span>REGISTER</span></div>
        <form className="registration-form" onSubmit={submitLogin}><label><span>EMAIL</span><input required type="email" autoComplete="email" placeholder="you@organisation.in" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label><span>PASSWORD</span><input required minLength={8} type="password" autoComplete="current-password" placeholder="••••••••" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label><button type="button" className="forgot-password" onClick={() => setError("Password reset will use the authentication service connected to this project.")}>Forgot password?</button>{error && <p className="form-error" role="alert">{error}</p>}<div className="registration-actions"><button className="register-submit" type="submit" disabled={busy}>LOG IN <ShieldCheck size={15} /></button><button className="cancel-submit" type="button" onClick={() => { setError(""); setStep("register"); }}>REGISTER</button></div></form>
      </> : step === "register" ? <>
        <div className="modal-kicker"><span className="rule" /> TRUSTED ENTRY</div>
        <h2 id="role-title">Create your identity</h2>
        <p>Your authenticated account determines your DID, role, permissions and resources.</p>
        <div className="flow-tabs"><span className="active">REGISTER</span><span>CHOOSE ROLE</span></div>
        <form className="registration-form" onSubmit={submitRegistration}><label><span>NAME</span><input required autoComplete="name" placeholder="Your real name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label><span>EMAIL</span><input required type="email" autoComplete="email" placeholder="you@organisation.in" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label><span>PASSWORD <small>(8+ characters)</small></span><input required minLength={8} type="password" autoComplete="new-password" placeholder="••••••••" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label><label><span>CONFIRM PASSWORD</span><input required minLength={8} type="password" autoComplete="new-password" placeholder="••••••••" value={form.confirm} onChange={event => setForm({ ...form, confirm: event.target.value })} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="registration-actions"><button className="register-submit" type="submit" disabled={busy}>REGISTER <ShieldCheck size={15} /></button><button className="cancel-submit" type="button" onClick={onClose}>CANCEL</button></div></form>
      </> : <>
        <div className="modal-kicker"><span className="rule" /> AUTHORITY CHECK / 01</div>
        <h2 id="role-title">Choose your role</h2>
        <p>Registration is complete. Select the authority boundary that matches the account you are creating.</p>
        <div className="flow-tabs"><span className="complete">REGISTERED</span><span className="active">CHOOSE ROLE</span></div>
        <div className="role-options">{roles.map(([key, label, desc]) => <button type="button" key={label} className={selected === label ? "selected" : ""} onClick={() => setSelected(label)}><span className="role-key">{key}</span><span><strong>{label}</strong><small>{desc}</small></span><ChevronRight size={15} /></button>)}</div>
        <button className="modal-continue" onClick={continueToConsole}>Continue as {selected}<ArrowRight size={15} /></button>
      </>}
    </div>
  </div>;
}

function DashboardIdentity() {
  const session = getSession();
  return <div className="dashboard-shell"><aside className="dashboard-sidebar"><a className="dashboard-brand" href="/"><img src="/brand/samvid-logo.png" alt="Samvid logo" /><strong>SAMVID</strong></a><div className="dashboard-status">NETWORK · HARDHAT LOCAL</div><nav><a className="active" href="/dashboard/identity">MY IDENTITY</a><a href="/console/user/access">ACCESS CONTROL</a><a href="/console/user/assets">ASSET OWNERSHIP</a><a href="/console/user/audit">AUDIT TRAIL</a></nav><a className="dashboard-exit" href="/">← EXIT TO FIELD</a></aside><main className="dashboard-main"><header className="dashboard-header"><div><span className="dashboard-kicker">OWNER CONSOLE / 01</span><h1>My <em>Identity.</em></h1></div><span className="dashboard-live">IDENTITY · VERIFIED</span></header><section className="identity-dashboard-grid"><article className="identity-visual-card"><div className="identity-card-head"><span>IDENTITY CORE / DID</span><b>VERIFIED</b></div><div className="identity-scene-panel"><IdentityScene /></div></article><aside className="identity-details"><span className="dashboard-kicker">SELF-SOVEREIGN RECORD</span><h2>One identity.<br /><em>Owner-controlled.</em></h2><p>Samvid holds the proof path for every permission, asset, and consequence attached to this account.</p><div className="identity-facts"><div><span>STATUS</span><strong>ACTIVE / VERIFIED</strong></div><div><span>IDENTIFIER</span><strong>{session?.did || "DID:SV-0001-OWNER"}</strong></div><div><span>ACCOUNT</span><strong>{session?.email || "OWNER@SAMVID.LOCAL"}</strong></div><div><span>LAST PROOF</span><strong>BLOCK 001284 · HARDHAT</strong></div></div><button className="identity-action" onClick={() => window.location.href = "/console/user/identity/edit"}>Edit identity <ArrowRight size={14} /></button></aside></section></main></div>;
}

function Redirect({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return null;
}

function NetworkTag() {
  const [network, setNetwork] = useState("HARDHAT LOCAL");
  useEffect(() => {
    api.getBlockchainStatus().then((status) => setNetwork(status.network?.toUpperCase() ?? "HARDHAT LOCAL")).catch(() => {});
  }, []);
  return <span className="net-tag">NETWORK · {network}</span>;
}

/** In remote mode, validates the stored JWT with GET /auth/me on mount and
 * clears the session cleanly when the token is expired or invalid. */
function useSessionGate() {
  const [restoring, setRestoring] = useState(() => isRemote && Boolean(getToken()));
  useEffect(() => {
    if (!isRemote) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    api.fetchMe().then((me) => {
      if (cancelled) return;
      if (me) {
        const current = getSession();
        if (current) setSession({ ...current, name: me.name ?? current.name, role: (me.role ?? current.role) as Session["role"], userId: me.id ?? current.userId, did: me.did ?? current.did });
      } else {
        // Invalid/expired token: clear auth state so the UI returns to signed-out.
        clearSession();
      }
      setRestoring(false);
    }).catch(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, []);
  return { restoring };
}

export default function App() {
  // Always-callable hook so the component never violates the rules of hooks,
  // regardless of which branch renders below.
  const sessionState = useSessionGate();
  const path = window.location.pathname;
  if (path.startsWith("/console/")) {
    const role = path.split("/")[2] as (typeof consoleRoles)[number];
    if (consoleRoles.includes(role)) return <RoleConsole role={role} />;
  }
  if (path === "/dashboard" || path === "/dashboard/identity" || path === "/identity" || path === "/did") return <DashboardIdentity />;
  if (path === "/access") return <Redirect to="/console/user/access" />;
  if (path === "/asset") return <Redirect to="/console/user/assets" />;
  if (path === "/audit") return <Redirect to="/console/user/audit" />;
  if (path === "/did/create") return <Redirect to="/console/user/identity/edit" />;
  if (path === "/404") return <NotFound />;
  const [modal, setModal] = useState<"register" | "login" | null>(null);
  const session = sessionState.restoring ? null : getSession();
  const landing = (
    <div className="site-shell">
      <header className="topbar"><div className="brand-lockup"><img src="/brand/samvid-logo.png" alt="Samvid logo" /><strong>SAMVID</strong></div><nav><NetworkTag />{session ? <button onClick={() => { clearSession(); window.location.href = "/"; }}>Sign out</button> : <button onClick={() => setModal("login")}>Log in</button>}{session ? <button className="dark-button" onClick={() => window.location.href = `/console/${session.role.toLowerCase()}`}>Open console <ArrowRight size={15} /></button> : <button className="dark-button" onClick={() => setModal("register")}>Create account <ArrowRight size={15} /></button>}</nav></header>
      <main>
        <section className="hero-section"><aside className="chapter-rail">{[["00", "ENTRY"], ["01", "DID"], ["02", "ACCESS"], ["03", "ASSET"], ["04", "BLOCK"], ["05", "AUDIT"]].map(([n, l]) => <div key={n}><small>{n}</small><strong>{l}</strong></div>)}</aside>
          <div className="hero-copy"><div className="eyebrow"><span className="rule" /> DECENTRALIZED IDENTITY PLATFORM</div><h1>Identity.<br />Access.<br /><em>Ownership.</em></h1><p>A secure, inspectable environment for decentralized identities, role-based access, and verifiable digital assets.</p><div className="hero-actions"><Button className="primary-button" onClick={() => setModal("register")}>Choose your role <ArrowRight size={16} /></Button><button className="quiet-button" onClick={() => setModal("register")}>Trace the proof path <ChevronRight size={16} /></button></div><div className="sequence-strip">{["PERSON", "DID", "PROOF", "ACCESS", "ASSET", "AUDIT"].map((item, i) => <span key={item}><b>0{i + 1}</b>{item}</span>)}</div></div>
          <div className="hero-art"><div className="identity-scene-wrap"><IdentityScene /></div><div className="art-label">SAMVID / PROOF FIELD</div></div>
        </section>
        <section className="principles"><div className="section-marker">PROOF PATH / OPERATING MODEL <span>01 — 04</span></div><div className="principle-grid">{[["01", "Verify identity", "Create a self-sovereign DID that belongs to the account, not a central directory."], ["02", "Check authority", "Choose a role, then let RBAC policies define the boundary of every action."], ["03", "Anchor ownership", "Mint and allocate unique NFT assets only through authorized governance."], ["04", "Trace consequence", "Every decision becomes an inspectable event on the immutable audit path."]].map(([n, h, p]) => <article key={n}><span>{n}</span><h3>{h}</h3><p>{p}</p></article>)}</div></section>
      </main><footer><div><strong>SAMVID</strong></div><small>IDENTITY · ACCESS · OWNERSHIP</small><small>© 2026 SAMVID</small></footer>{modal && <RoleModal startStep={modal} onClose={() => setModal(null)} />}
    </div>
  );
  if (path !== "/") return <NotFound />;
  return landing;
}