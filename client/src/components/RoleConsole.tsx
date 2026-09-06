/* Samvid role-console style: light editorial surfaces, restrained proof colors, and controls that reflect backend role boundaries. */
import { useEffect, useState } from "react";
import { ArrowRight, Ban, Check, ChevronRight, CircleAlert, FileIcon, FilePlus2, KeyRound, Link2, Lock, LogOut, Send, ShieldCheck, Trash2, UserCog, WalletCards } from "lucide-react";
import { AssetDocument } from "./AssetDocument";
import { IdentityScene } from "./IdentityScene";
import { api, isRemote, missingBackendEndpoints, ApiError, accountStorageKey, assetTypeLabel, type LocalAccountState } from "@/lib/api";
import { clearSession, getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDate, shortHash, titleCase } from "@/lib/format";
import type { AuditEvent, Asset, AssetType, Grant, Permission, Role as URole } from "@/lib/types";
type Role = "user" | "manager" | "admin" | "auditor";
type AdminView = "dashboard" | "users" | "roles" | "assets" | "audit";
type UserView = "dashboard" | "assets" | "asset-detail" | "access" | "audit" | "create" | "identity-edit";
type ManagerView = "dashboard" | "access" | "assets" | "audit";

type ConsoleProps = { role: Role };

const roleMeta: Record<Role, { label: string; eyebrow: string; title: string; intro: string }> = {
  user: { label: "USER", eyebrow: "OWNER CONSOLE / 02", title: "Your assets, your authority.", intro: "Create, verify, and control access to the assets attached to your identity." },
  manager: { label: "MANAGER", eyebrow: "ACCESS CONSOLE / 03", title: "The access layer, governed.", intro: "Review identities, grant permissions, and trace every access consequence across the system." },
  admin: { label: "ADMIN", eyebrow: "SYSTEM CONSOLE / 00", title: "The trust layer, governed.", intro: "Manage users, roles, assets, and the consequences recorded across the system." },
  auditor: { label: "AUDITOR", eyebrow: "EVIDENCE CONSOLE / 06", title: "Every action leaves evidence.", intro: "Inspect audit activity and blockchain verification without mutation rights." },
};

const emptyAccount = (): LocalAccountState => ({ assets: [], activity: [] });

const readAccount = (email: string): LocalAccountState => {
  try {
    const saved = localStorage.getItem(accountStorageKey(email));
    if (!saved) return emptyAccount();
    const parsed = JSON.parse(saved) as Partial<LocalAccountState>;
    return { assets: Array.isArray(parsed.assets) ? parsed.assets : [], activity: Array.isArray(parsed.activity) ? parsed.activity as [string, string, string][] : [] };
  } catch {
    return emptyAccount();
  }
};

function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null, loading: true });
    loader()
      .then((data) => { if (!cancelled) setState({ data, error: null, loading: false }); })
      .catch((err) => { if (!cancelled) setState({ data: null, error: err instanceof Error ? err.message : "Request failed", loading: false }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

function Stat({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return <article className="console-stat"><span>{label}</span><strong className={accent ? "accent" : ""}>{value}</strong><small>{note}</small></article>;
}

function ConsoleHeader({ role }: ConsoleProps) {
  const meta = roleMeta[role];
  return <header className="console-header"><div><span className="console-kicker">{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.intro}</p></div><div className="console-role-stamp"><span className="console-role-dot" />{meta.label}<small>ROLE VERIFIED</small></div></header>;
}

function ConsoleNav({ role }: ConsoleProps) {
  const items = role === "user"
    ? [["/console/user", "Dashboard"], ["/console/user/assets", "My Assets"], ["/console/user/access", "Access Control"], ["/console/user/audit", "Audit Trail"], ["/dashboard/identity", "My Identity"]]
    : role === "manager"
      ? [["/console/manager", "Dashboard"], ["/console/manager/access", "Access Control"], ["/console/manager/assets", "Assets"], ["/console/manager/audit", "Audit Trail"]]
      : role === "admin"
        ? [["/console/admin", "Admin Dashboard"], ["/console/admin/users", "User Management"], ["/console/admin/roles", "Role Management"], ["/console/admin/assets", "Asset Viewing"], ["/console/admin/audit", "Audit Logs"]]
        : [["/console/auditor", "Auditor Dashboard"], ["/console/auditor/assets", "Asset Verification"], ["/console/auditor/audit", "Audit Logs"], ["/console/auditor/blockchain", "Blockchain"]];
  return <nav className="console-nav">{items.map(([href, label]) => <a key={href} href={href} className={window.location.pathname === href ? "active" : ""}>{label}<ChevronRight size={13} /></a>)}</nav>;
}

function NetworkStatus() {
  const status = useLoad(() => api.getBlockchainStatus(), []);
  return <div className="console-network"><span>NETWORK</span><strong>{status.data?.network ?? "Hardhat Local"}</strong><span>CHAIN</span><strong>{status.data?.connected ? "Connected" : "Offline"}</strong></div>;
}

function SignOutLink() {
  return <a className="console-signout" href="/" onClick={(event) => { event.preventDefault(); clearSession(); window.location.href = "/"; }}><LogOut size={12} /> Sign out · clear session</a>;
}

function Block({ loading, error, children }: { loading: boolean; error: string | null; children: React.ReactNode }) {
  if (loading) return <div className="empty-state"><strong>Loading records…</strong><span>Querying the Samvid registry.</span></div>;
  if (error) return <div className="empty-state"><strong>Registry unavailable.</strong><span>{error}</span></div>;
  return <>{children}</>;
}

function ActionMsg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={msg.ok ? "form-error action-ok" : "form-error"} role="status">{msg.text}</p>;
}

function auditToRows(events: AuditEvent[]): string[][] {
  return events.map((event) => [formatDate(event.timestamp), event.actorName, titleCase(event.action), event.resourceName, event.resourceId]);
}

function GrantTable({ grants, onRevoke, revoking }: { grants: Grant[]; onRevoke: (id: string) => void; revoking?: boolean }) {
  return <div className="grant-table"><div className="grant-head"><span>Asset</span><span>Account</span><span>Permission</span><span>Status</span><span>Granted by</span><span /></div>{grants.map((grant) => <div className="grant-row" key={grant.id}><span><strong>{grant.assetName}</strong><small>{grant.assetId}</small></span><span>{grant.userName}<small>{grant.userEmail}</small></span><em>{grant.permission}</em><span className={`status-pill ${grant.status === "ACTIVE" ? "allowed" : grant.status === "REVOKED" ? "revoked" : ""}`}>{grant.status}</span><span className="grant-actor">{grant.grantedBy}<small>{formatDate(grant.grantedAt)}</small></span><span>{grant.status === "ACTIVE" && <button className="revoke-button" type="button" disabled={revoking} onClick={() => onRevoke(grant.id)}><Ban size={13} /> Revoke</button>}</span></div>)}</div>;
}

/* ---------------------------------------------------------------- */
/* USER console                                                      */
/* ---------------------------------------------------------------- */

function UserDashboard({ email }: { email: string }) {
  const [account, setAccount] = useState<LocalAccountState>(() => readAccount(email));
  useEffect(() => {
    setAccount(readAccount(email));
    const sync = (event: StorageEvent) => { if (event.key === accountStorageKey(email)) setAccount(readAccount(email)); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [email]);
  const assets = useLoad(() => api.listAssets({ ownerEmail: email }), [email]);
  const audit = useLoad(() => api.listAudit({ mine: true }), []);
  const owned = assets.data ?? [];
  const verified = owned.filter((asset) => asset.status === "VERIFIED").length;
  const activityCount = (audit.data ?? []).length;
  return <><div className="console-stats"><Stat label="Total assets" value={String(owned.length).padStart(2, "0")} note="Attached to your DID" accent /><Stat label="Verified assets" value={String(verified).padStart(2, "0")} note="Registered on-chain" /><Stat label="Pending records" value={String(owned.filter((a) => a.status === "PENDING").length).padStart(2, "0")} note="Awaiting verification" /><Stat label="Recent activity" value={String(activityCount).padStart(2, "0")} note="Recorded events" /></div><div className="console-two-col"><section className="console-card"><div className="console-card-head"><div><span className="console-kicker">MY ASSETS / 01</span><h2>Owned resources.</h2></div><a className="console-link" href="/console/user/create">Create asset <ArrowRight size={13} /></a></div><div className="asset-list"><Block loading={assets.loading} error={assets.error}>{owned.length ? owned.map(asset => <article className="asset-row" key={asset.id}><div className="asset-icon"><WalletCards size={16} /></div><div className="asset-main"><strong>{asset.name}</strong><span>{assetTypeLabel(asset.type)} · {formatDate(asset.createdAt)}</span></div><span className="verified-pill"><Check size={12} /> {asset.status}</span><a href={`/console/user/assets/${asset.id}`} className="icon-link" aria-label={`View ${asset.name}`}><ChevronRight size={16} /></a></article>) : <div className="empty-state"><strong>No assets attached yet.</strong><span>This account has no uploaded documents or ownership records.</span><a className="console-link" href="/console/user/create">Create your first asset <ArrowRight size={13} /></a></div>}</Block></div></section><section className="console-card identity-mini-card"><div className="console-card-head"><div><span className="console-kicker">MY IDENTITY / CORE</span><h2>Protected by Samvid.</h2></div></div><div className="identity-mini-scene"><IdentityScene /></div><a className="console-link identity-mini-link" href="/dashboard/identity">Open identity field <ArrowRight size={13} /></a></section></div><section className="console-card activity-card"><div className="console-card-head"><div><span className="console-kicker">ACTIVITY / RECENT</span><h2>What changed.</h2></div><a className="console-link" href="/console/user/audit">View all <ArrowRight size={13} /></a></div><div className="activity-list"><Block loading={audit.loading} error={audit.error}>{(audit.data ?? []).slice(0, 4).map((event) => <div className="activity-row" key={event.id}><span className="activity-marker" /><div><strong>{titleCase(event.action)}</strong><span>{event.resourceName || event.resourceId}</span></div><time>{formatDate(event.timestamp)}</time></div>)}</Block></div></section></>;
}

function UserAssetsPage({ email }: { email: string }) {
  const assets = useLoad(() => api.listAssets({ ownerEmail: email }), [email]);
  return <section className="console-card user-page"><div className="console-card-head"><div><span className="console-kicker">MY ASSETS / REGISTER</span><h2>Owned resources.</h2><p>Every record attached to your identity, with its verification and chain registration state.</p></div><a className="console-link" href="/console/user">← Back to dashboard</a></div><Block loading={assets.loading} error={assets.error}><div className="audit-table"><div className="audit-head"><span>Asset</span><span>Type</span><span>Created</span><span>Status</span><span>ID</span><span /></div>{assets.data?.map(asset => <div className="audit-row" key={asset.id}><span>{asset.name}</span><span>{assetTypeLabel(asset.type)}</span><span>{formatDate(asset.createdAt)}</span><span className={asset.status === "VERIFIED" ? "allowed" : "blocked"}>{asset.status}</span><span>{asset.id}</span><a className="console-link" href={`/console/user/assets/${asset.id}`}>Inspect <ArrowRight size={12} /></a></div>) ?? <div className="empty-state"><strong>No assets attached yet.</strong><span>Create your first record to begin the proof path.</span></div>}</div></Block></section>;
}

function AssetActions({ asset, role, email, reload }: { asset: Asset; role: Role; email: string; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ name: string; description: string; type: AssetType }>({ name: asset.name, description: asset.description, type: asset.type });
  const [grantUser, setGrantUser] = useState("");
  const [grantPermission, setGrantPermission] = useState<Permission>("READ");
  const users = useLoad(() => api.listUsers().catch(() => []), []);
  const grants = useLoad(() => api.listAssetAccess(asset.id), [asset.id]);
  const urole = role.toUpperCase() as URole;
  const run = async (fn: () => Promise<unknown>, okText: string): Promise<void> => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: okText }); reload(); grants.reload(); }
    catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Action failed" }); }
    finally { setBusy(false); }
  };
  const assetGrants = grants.data ?? [];
  return <div className="asset-actions">
    <div className="console-card-head"><div><span className="console-kicker">ASSET ACTIONS / PROOF PATH</span><h2>Operate on this record.</h2></div></div>
    <ActionMsg msg={msg} />
    <div className="asset-action-buttons">
      {can(urole, "editAsset") && <button className="register-submit" type="button" onClick={() => { setEditForm({ name: asset.name, description: asset.description, type: asset.type }); setEditing(!editing); }}><FileIcon size={14} /> {editing ? "Close editor" : "Edit"}</button>}
      {can(urole, "deleteAsset") && <button className="revoke-button" type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete ${asset.name}? This records an ASSET_DELETED audit event.`)) run(() => api.deleteAsset(asset.id), "Asset deleted.").then(() => { window.location.href = "/console/user/assets"; }); }}><Trash2 size={14} /> Delete</button>}
    </div>
    {editing && can(urole, "editAsset") && <form className="inline-form" onSubmit={(event) => { event.preventDefault(); run(() => api.updateAsset(asset.id, editForm), "Asset updated."); setEditing(false); }}>
      <label><span>ASSET NAME</span><input required value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
      <label><span>DESCRIPTION</span><textarea required minLength={12} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} /></label>
      <label><span>ASSET TYPE</span><select value={editForm.type} onChange={(event) => setEditForm({ ...editForm, type: event.target.value as AssetType })}><option value="DOCUMENT">VERIFIABLE DOCUMENT</option><option value="CERTIFICATE">NFT / PROOF</option><option value="ACCESS_MANIFEST">ACCESS MANIFEST</option><option value="CREDENTIAL">CREDENTIAL</option></select></label>
      <button className="register-submit" type="submit" disabled={busy}><Check size={14} /> Save changes</button>
    </form>}
    {can(urole, "grantAccess") && <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (!grantUser) return; run(() => api.createAssetAccess(asset.id, { userId: grantUser, permission: grantPermission }), "Access granted and recorded."); setGrantUser(""); }}><label><span>GRANT ACCESS TO</span><select required value={grantUser} onChange={(event) => setGrantUser(event.target.value)}><option value="">Select account…</option>{(users.data ?? []).filter((u) => u.email.toLowerCase() !== email.toLowerCase()).map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}</select></label><label><span>PERMISSION</span><select value={grantPermission} onChange={(event) => setGrantPermission(event.target.value as Permission)}><option>READ</option><option>UPDATE</option><option>DELETE</option></select></label><button className="register-submit" type="submit" disabled={busy}><KeyRound size={14} /> Grant access</button></form>}
    {assetGrants.length > 0 && <div className="asset-grants"><span className="console-kicker">ACTIVE GRANTS / THIS ASSET</span>{assetGrants.map((grant) => <div className="activity-row" key={grant.id}><span className="activity-marker" /><div><strong>{grant.userName || grant.userEmail || grant.userId}</strong><span>{grant.permission} · granted by {grant.grantedBy || "owner"}</span></div>{grant.status === "ACTIVE" ? <button className="revoke-button" type="button" disabled={busy} onClick={() => run(() => api.revokeAssetAccess(asset.id, grant.id), "Access revoked and recorded.")}><Ban size={13} /> Revoke</button> : <span className="status-pill revoked">{grant.status}</span>}</div>)}</div>}
  </div>;
}

function UserAssetDetailPage({ email, id, role }: { email: string; id: string; role: Role }) {
  const asset = useLoad(() => api.getAsset(id), [id]);
  const chain = useLoad(() => api.getAssetBlockchain(id), [id]);
  const nft = useLoad(() => api.getAssetNft(id), [id]);
  if (asset.data === null && !asset.loading) return <section className="console-card"><div className="empty-state"><strong>Record not found.</strong><span>{id} is not attached to this account.</span><a className="console-link" href="/console/user/assets">← Back to my assets</a></div></section>;
  return <section className="console-card user-page"><div className="console-card-head"><div><span className="console-kicker">ASSET RECORD / {id}</span><h2>{asset.data?.name ?? "Loading record…"}</h2><p>{asset.data?.description}</p></div><a className="console-link" href="/console/user/assets">← Back to assets</a></div><Block loading={asset.loading} error={asset.error}>{asset.data && <>
    <div className="asset-detail-grid"><div className="detail-facts">
      <div><span>OWNER</span><strong>{asset.data.ownerName}</strong></div>
      <div><span>OWNER ID</span><strong>{asset.data.ownerId || "—"}</strong></div>
      <div><span>ACCOUNT</span><strong>{asset.data.ownerEmail}</strong></div>
      <div><span>DID</span><strong>{shortHash(asset.data.ownerDid, 10, 6) || "did:sv:pending"}</strong></div>
      <div><span>TYPE</span><strong>{assetTypeLabel(asset.data.type)}</strong></div>
      <div><span>STORAGE REF</span><strong>{asset.data.storageRef || "—"}</strong></div>
      <div><span>CREATED</span><strong>{formatDate(asset.data.createdAt)}</strong></div>
      <div><span>UPDATED</span><strong>{formatDate(asset.data.updatedAt)}</strong></div>
      <div><span>CHAIN STATUS</span><strong className={chain.data?.registered ? "allowed" : "blocked"}>{chain.loading ? "Checking…" : chain.data?.registered ? (chain.data.status ?? "REGISTERED") : "NOT REGISTERED"}</strong></div>
      <div><span>NFT</span><strong>{nft.loading ? "Checking…" : nft.data ? `#${nft.data.tokenId ?? "?"}` : "NOT MINTED"}</strong></div>
    </div>
    <div className="detail-nft"><span className="console-kicker">BLOCKCHAIN / REGISTRATION</span>
      <Block loading={chain.loading} error={chain.error}>
        {chain.data?.registered ? <>
          {chain.data.transactionHash && <div><span>TRANSACTION</span><strong>{shortHash(chain.data.transactionHash, 8, 6)}</strong></div>}
          {chain.data.blockNumber !== undefined && <div><span>BLOCK</span><strong>#{chain.data.blockNumber}</strong></div>}
          {chain.data.network && <div><span>NETWORK</span><strong>{chain.data.network}</strong></div>}
          {chain.data.contractAddress && <div><span>CONTRACT</span><strong>{shortHash(chain.data.contractAddress, 8, 6)}</strong></div>}
        </> : <div className="empty-state"><strong>Not registered on-chain.</strong><span>This record has no blockchain registration yet.</span></div>}
      </Block>
      <span className="console-kicker" style={{ display: "block", marginTop: "0.9rem" }}>NFT / OWNERSHIP PROOF</span>
      <Block loading={nft.loading} error={nft.error}>
        {nft.data ? <>
          {nft.data.tokenId !== undefined && <div><span>TOKEN ID</span><strong>#{nft.data.tokenId}</strong></div>}
          {nft.data.contractAddress && <div><span>CONTRACT</span><strong>{shortHash(nft.data.contractAddress, 8, 6)}</strong></div>}
          {nft.data.transactionHash && <div><span>TRANSACTION</span><strong>{shortHash(nft.data.transactionHash, 8, 6)}</strong></div>}
          {nft.data.network && <div><span>NETWORK</span><strong>{nft.data.network}</strong></div>}
          {nft.data.mintedAt && <div><span>MINTED</span><strong>{formatDate(nft.data.mintedAt)}</strong></div>}
        </> : <div className="empty-state"><strong>Not minted yet.</strong><span>This record has no on-chain proof until it is minted.</span></div>}
      </Block>
    </div></div>
    <AssetDocument asset={asset.data} />
    <AssetActions asset={asset.data} role={role} email={email} reload={asset.reload} />
  </>}</Block></section>;
}

function AssetDocumentInline({ asset }: { asset: Asset }) {
  return <AssetDocument asset={asset} />;
  if (!asset.fileName) return null;
  const kb = Math.round((asset.fileSize ?? 0) / 1024);
  const typeLabel = asset.contentType || "application/octet-stream";
  return (
    <div className="asset-document">
      <span className="console-kicker">ATTACHED DOCUMENT</span>
      <div className="file-chip file-ok">
        <FileIcon size={12} />
        <span>
          {asset.fileName}<br />
          <small>{kb} KB · {typeLabel}</small>
        </span>
      </div>
      {asset.storageRef && (
        <div className="asset-file-note">
          <span className="console-kicker">STORE</span>
          <span>Backend storage path: {asset.storageRef}</span>
        </div>
      )}
      {asset.fileHash && (
        <div className="asset-file-note">
          <span className="console-kicker">VERIFICATION</span>
          <span>File hash recorded: {asset.fileHash}</span>
        </div>
      )}
    </div>
  );
}

function filePreviewMarkup(form: {
  fileName: string;
  fileSize: number;
  contentType: string;
  file: File | null;
}, ok: boolean, email: string) {
  if (!form.fileName) return null;
  const kb = Math.round(form.fileSize / 1024);
  const typeLabel = form.contentType || "application/octet-stream";
  return (
    <div className="asset-file-preview">
      <div className={`file-chip ${ok ? "file-ok" : "file-warn"}`}>
        <FileIcon size={12} />
        <span>
          {form.fileName}<br />
          <small>{kb} KB · {typeLabel}</small>
        </span>
      </div>
      {ok && (
        <div className="asset-file-note">
          <span className="console-kicker">ATTACHED TO THIS RECORD</span>
          <span>When the backend is wired, this file will be stored for {email} and linked to the asset above.</span>
        </div>
      )}
    </div>
  );
}

function UserAccessPage({ email, role }: { email: string; role: Role }) {
  const grants = useLoad(() => api.listGrants(), []);
  const mine = (grants.data ?? []).filter((grant) => grant.userEmail.toLowerCase() === email.toLowerCase());
  const urole = role.toUpperCase() as URole;
  return <section className="console-card user-page"><div className="console-card-head"><div><span className="console-kicker">ACCESS CONTROL / GRANTS</span><h2>Permissions on your records.</h2><p>Every grant is explicit, recorded, and reversible. Only active grants allow access.</p></div><a className="console-link" href="/console/user">← Back to dashboard</a></div><Block loading={grants.loading} error={grants.error}><div className="grant-table"><div className="grant-head"><span>Asset</span><span>Granted to</span><span>Permission</span><span>Status</span><span>Granted by</span><span /></div>{mine.length ? mine.map((grant) => <div className="grant-row" key={grant.id}><span><strong>{grant.assetName}</strong><small>{grant.assetId}</small></span><span>{grant.userName}<small>{grant.userEmail}</small></span><em>{grant.permission}</em><span className={`status-pill ${grant.status === "ACTIVE" ? "allowed" : grant.status === "REVOKED" ? "revoked" : ""}`}>{grant.status}</span><span className="grant-actor">{grant.grantedBy}<small>{formatDate(grant.grantedAt)}</small></span><span /></div>) : <div className="empty-state"><strong>No grants on your records.</strong><span>Open an asset record to grant access.</span></div>}</div></Block></section>;
}

function UserAuditPage({ email }: { email: string }) {
  const audit = useLoad(() => api.listAudit({ mine: true }), []);
  const mine = (audit.data ?? []).filter((event) => !event.actorEmail || event.actorEmail.toLowerCase() === email.toLowerCase());
  return <section className="console-card user-page"><div className="console-card-head"><div><span className="console-kicker">AUDIT TRAIL / MY EVENTS</span><h2>Your proof path.</h2><p>Immutable events generated by identity, access, and asset actions on this account.</p></div><a className="console-link" href="/console/user">← Back to dashboard</a></div><Block loading={audit.loading} error={audit.error}><div className="audit-table"><div className="audit-head"><span>Timestamp</span><span>Actor</span><span>Action</span><span>Resource</span><span>ID</span></div>{mine.map((event) => <div className="audit-row" key={event.id}>{[formatDate(event.timestamp), event.actorName, titleCase(event.action), event.resourceName, event.resourceId].map((cell, index) => <span key={`${event.id}-${index}`}>{cell}</span>)}</div>)}</div></Block></section>;
}

function IdentityEditPage({ email }: { email: string }) {
  const identity = useLoad(() => api.getIdentity(), []);
  const [form, setForm] = useState<{ name: string; did: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const current = form ?? (identity.data ? { name: identity.data.name, did: identity.data.did } : null);
  return <section className="console-card user-page"><div className="console-card-head"><div><span className="console-kicker">IDENTITY / DID RECORD</span><h2>Edit your identity.</h2><p>Your name and DID are the anchors of every proof attached to this account.</p></div><a className="console-link" href="/dashboard/identity">← Identity field</a></div>{isRemote && <div className="empty-state" style={{ marginBottom: "1rem" }}><strong>Read-only in remote mode.</strong><span>{missingBackendEndpoints.identity}</span></div>}<Block loading={identity.loading} error={identity.error}>{current && <form className="asset-create-form" onSubmit={async (event) => { event.preventDefault(); try { await api.updateIdentity(form ?? current); setMsg({ ok: true, text: "Identity updated and recorded." }); setForm(null); identity.reload(); } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Update failed" }); } }}><label><span>NAME</span><input required value={current.name} onChange={(event) => setForm({ ...current, name: event.target.value })} /></label><label><span>DECENTRALIZED IDENTIFIER (DID)</span><input required value={current.did} onChange={(event) => setForm({ ...current, did: event.target.value })} placeholder="did:sv:…" /></label><label><span>ACCOUNT</span><input disabled value={email} /></label><ActionMsg msg={msg} /><div className="registration-actions"><button className="register-submit" type="submit">SAVE IDENTITY <ArrowRight size={15} /></button></div></form>}</Block></section>;
}

function CreateAssetPage({ email }: { email: string }) {
  const [form, setForm] = useState<{
    name: string;
    type: AssetType;
    description: string;
    file: File | null;
    fileName: string;
    fileSize: number;
    contentType: string;
    fileHash: string;
  }>({ name: "", type: "DOCUMENT", description: "", file: null, fileName: "", fileSize: 0, contentType: "", fileHash: "" });
  const [saved, setSaved] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const maxFileBytes = 15 * 1024 * 1024;
  const allowedDocTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "image/png",
    "image/jpeg",
  ];

  const selectedFileOk = form.file &&
    allowedDocTypes.includes(form.contentType.trim().toLowerCase()) &&
    form.fileSize > 0 &&
    form.fileSize <= maxFileBytes;

  const readFully = (blob: Blob): Promise<ArrayBuffer> => blob.arrayBuffer();

  const hashHex = async (blob: Blob): Promise<string> => {
    const buffer = await readFully(blob);
    let h = 0;
    const view = new DataView(buffer);
    for (let i = 0; i < view.byteLength; i++) {
      h = (h * 31 + view.getUint8(i)) >>> 0;
    }
    const hex = h.toString(16).padStart(8, "0").toUpperCase();
    return `${hex}…${hex.slice(-4)}`;
  };

  const fileChanged = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setForm({ ...form, file: null, fileName: "", fileSize: 0, contentType: "", fileHash: "" });
      return;
    }
    if (!allowedDocTypes.includes(file.type.trim().toLowerCase())) {
      setMsg({ ok: false, text: "Please choose a document, image, or plain-text file." });
      return;
    }
    if (file.size > maxFileBytes) {
      setMsg({ ok: false, text: "File is too large. Maximum is 15 MB." });
      return;
    }
    setMsg(null);
    const hash = await hashHex(file);
    setForm({
      ...form,
      file,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
      fileHash: hash,
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFileOk && form.file) {
      setMsg({ ok: false, text: "Please choose a supported document file." });
      return;
    }
    try {
      const asset = await api.createAsset({
        name: form.name,
        type: form.type as Asset["type"],
        description: form.description,
        storageKey: form.fileName ? `/uploads/${email.toLowerCase()}/${form.fileName}` : `records/${email.toLowerCase()}/${form.name.toLowerCase().replace(/\\s+/g, "-")}`,
        fileName: form.fileName,
        fileSize: form.fileSize,
        contentType: form.contentType,
        fileHash: form.fileHash,
      });
      setSaved(asset.id);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    }
  };

  return (
    <section className="console-card create-asset-page">
      <div className="console-card-head">
        <div>
          <span className="console-kicker">USER ASSET / NEW RECORD</span>
          <h2>Create an asset.</h2>
        </div>
        <a className="console-link" href="/console/user">← Back to dashboard</a>
      </div>
      {saved ? (
        <div className="asset-success">
          <strong>{form.name} is attached to your identity.</strong>
          <span>Record {saved} is saved for {email} and is awaiting verification.</span>
          <a className="console-link" href="/console/user/assets">View my assets <ArrowRight size={13} /></a>
        </div>
      ) : (
        <form className="asset-create-form" onSubmit={submit}>
          <label>
            <span>ASSET NAME</span>
            <input
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Identity passport"
            />
          </label>
          <label>
            <span>ASSET TYPE</span>
            <select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value as AssetType })}
            >
              <option value="DOCUMENT">VERIFIABLE DOCUMENT</option>
              <option value="CERTIFICATE">NFT / PROOF</option>
              <option value="ACCESS_MANIFEST">ACCESS MANIFEST</option>
              <option value="CREDENTIAL">CREDENTIAL</option>
            </select>
          </label>
          <label>
            <span>DESCRIPTION</span>
            <textarea
              required
              minLength={12}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Describe what this asset proves."
            />
          </label>
          <label>
            <span>ATTACH DOCUMENT <span style={{ opacity: 0.55 }}>optional</span></span>
            <input
              type="file"
              accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,image/png,image/jpeg"
              onChange={fileChanged}
              disabled={!!form.file}
            />
          </label>
          {filePreviewMarkup(form, selectedFileOk ? true : false, email)}
          <ActionMsg msg={msg} />
          <div className="registration-actions">
            <button
              className="register-submit"
              type="submit"
              disabled={!form.file && !form.description.trim()}
            >
              SAVE ASSET <ArrowRight size={15} />
            </button>
            <a className="cancel-submit" href="/console/user">CANCEL</a>
          </div>
        </form>
      )}
    </section>
  );
}

function UserConsole({ email, role, view }: { email: string; role: Role; view: UserView }) {
  if (view === "create") return <CreateAssetPage email={email} />;
  if (view === "assets") return <UserAssetsPage email={email} />;
  if (view === "asset-detail") return <UserAssetDetailPage email={email} id={window.location.pathname.split("/").pop() ?? ""} role={role} />;
  if (view === "access") return <UserAccessPage email={email} role={role} />;
  if (view === "audit") return <UserAuditPage email={email} />;
  if (view === "identity-edit") return <IdentityEditPage email={email} />;
  return <UserDashboard email={email} />;
}

/* ---------------------------------------------------------------- */
/* MANAGER console                                                   */
/* ---------------------------------------------------------------- */

function ManagerDashboard() {
  const assets = useLoad(() => api.listAssets({ scope: "my" }), []);
  const grants = useLoad(() => api.listGrants(), []);
  const audit = useLoad(() => api.listAudit({ mine: true }), []);
  return <><div className="console-stats"><Stat label="My assets" value={String((assets.data ?? []).length).padStart(2, "0")} note="In your management scope" accent /><Stat label="Verified assets" value={String((assets.data ?? []).filter((a) => a.status === "VERIFIED").length).padStart(2, "0")} note="Registered on-chain" /><Stat label="Active grants" value={String((grants.data ?? []).filter((g) => g.status === "ACTIVE").length).padStart(2, "0")} note="Live access grants" /><Stat label="Recent activity" value={String((audit.data ?? []).length).padStart(2, "0")} note="Recorded events" /></div><div className="console-two-col"><section className="console-card"><div className="console-card-head"><div><span className="console-kicker">ACCESS CONTROL / 01</span><h2>Live permissions.</h2></div><a className="console-link" href="/console/manager/access">Manage grants <ArrowRight size={13} /></a></div><Block loading={grants.loading} error={grants.error}><div className="grant-table"><div className="grant-head"><span>Asset</span><span>Account</span><span>Permission</span><span>Status</span></div>{(grants.data ?? []).slice(0, 3).map((grant) => <div className="grant-row" key={grant.id}><span><strong>{grant.assetName}</strong><small>{grant.assetId}</small></span><span>{grant.userName}<small>{grant.userEmail}</small></span><em>{grant.permission}</em><span className={`status-pill ${grant.status === "ACTIVE" ? "allowed" : grant.status === "REVOKED" ? "revoked" : ""}`}>{grant.status}</span></div>)}</div></Block></section><section className="console-card admin-activity"><div className="console-card-head"><div><span className="console-kicker">MANAGER BOUNDARY / 02</span><h2>Permission scope.</h2></div></div><div className="admin-boundary"><ShieldCheck size={20} /><p>This console can grant and revoke access, verify records, and transfer ownership. Deleting assets and changing roles are restricted to ADMIN.</p></div><div className="permission-lines"><div><span>GRANT / REVOKE</span><strong>Access grants</strong></div><div><span>VERIFY / MINT</span><strong>Asset records</strong></div><div><span>ROLE CHANGES</span><strong>Admin only</strong></div></div></section></div><section className="console-card activity-card"><div className="console-card-head"><div><span className="console-kicker">RECENT ACTIVITY / 03</span><h2>System consequences.</h2></div><a className="console-link" href="/console/manager/audit">Open audit trail <ArrowRight size={13} /></a></div><Block loading={audit.loading} error={audit.error}><AuditTable rows={auditToRows((audit.data ?? []).slice(0, 4))} /></Block></section></>;
}

function ManagerAccessPage() {
  const grants = useLoad(() => api.listGrants(), []);
  const assets = useLoad(() => api.listAssets({ scope: "my" }), []);
  const users = useLoad(() => api.listUsers().catch(() => []), []);
  const [form, setForm] = useState<{ assetId: string; userId: string; permission: Permission }>({ assetId: "", userId: "", permission: "READ" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.assetId || !form.userId) return;
    setBusy(true); setMsg(null);
    try { await api.createAssetAccess(form.assetId, { userId: form.userId, permission: form.permission }); setMsg({ ok: true, text: "Access granted and recorded." }); setForm({ assetId: "", userId: "", permission: "READ" }); }
    catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Grant failed" }); }
    finally { setBusy(false); }
  };
  const revoke = async (assetId: string, grantId: string) => {
    setBusy(true);
    try { await api.revokeAssetAccess(assetId, grantId); } finally { setBusy(false); }
  };
  return <section className="console-card manager-page"><div className="console-card-head"><div><span className="console-kicker">ACCESS CONTROL / GRANTS</span><h2>Permission registry.</h2><p>Grant and revoke explicit access to asset records. Every change is recorded to the audit trail.</p></div><a className="console-link" href="/console/manager">← Manager dashboard</a></div><form className="inline-form grant-form" onSubmit={submit}><label><span>ASSET</span><select required value={form.assetId} onChange={(event) => setForm({ ...form, assetId: event.target.value })}><option value="">Select asset…</option>{(assets.data ?? []).map((asset) => <option key={asset.id} value={asset.id}>{asset.name} — {asset.id}</option>)}</select></label><label><span>ACCOUNT</span><select required value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })}><option value="">Select account…</option>{(users.data ?? []).map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select></label><label><span>PERMISSION</span><select value={form.permission} onChange={(event) => setForm({ ...form, permission: event.target.value as Permission })}><option>READ</option><option>UPDATE</option><option>DELETE</option></select></label><button className="register-submit" type="submit" disabled={busy}><KeyRound size={14} /> Grant access</button></form><ActionMsg msg={msg} /><Block loading={grants.loading} error={grants.error}>{(grants.data ?? []).length ? <GrantTable grants={grants.data ?? []} onRevoke={(grantId) => revoke(grantId, grantId)} revoking={busy} /> : <div className="empty-state"><strong>No grants recorded.</strong><span>Create a grant above to share an asset with another account.</span></div>}</Block></section>;
}

function ManagerAssetsPage() {
  const assets = useLoad(() => api.listAssets({ scope: "my" }), []);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); assets.reload(); } finally { setBusy(false); }
  };
  return <section className="console-card manager-page"><div className="console-card-head"><div><span className="console-kicker">ASSET REGISTER / VERIFICATION</span><h2>Asset registry.</h2><p>Verify, mint, and transfer ownership of records across the system. Deletion is not permitted for this role.</p></div><a className="console-link" href="/console/manager">← Manager dashboard</a></div><Block loading={assets.loading} error={assets.error}><div className="audit-table"><div className="audit-head"><span>Asset</span><span>Owner</span><span>Type</span><span>Status</span><span>ID</span><span>Actions</span></div>{assets.data?.map((asset) => <div className="audit-row" key={asset.id}><span>{asset.name}</span><span>{asset.ownerName}</span><span>{assetTypeLabel(asset.type)}</span><span className={asset.status === "VERIFIED" ? "allowed" : "blocked"}>{asset.status}</span><span>{asset.id}</span><span className="row-actions">{can("MANAGER", "verifyAsset") && asset.status !== "VERIFIED" && <button className="console-link" type="button" disabled={busy} onClick={() => run(() => api.verifyAsset(asset.id), "Verified")}><ShieldCheck size={12} /> Verify</button>}{can("MANAGER", "mintAsset") && !asset.nft && <button className="console-link" type="button" disabled={busy} onClick={() => run(() => api.mintAsset(asset.id), "Minted")}><FilePlus2 size={12} /> Mint</button>}</span></div>) ?? <div className="empty-state"><strong>Registry empty.</strong><span>No asset records exist yet.</span></div>}</div></Block></section>;
}

function ManagerAuditPage() {
  const audit = useLoad(() => api.listAudit({ mine: true }), []);
  return <section className="console-card manager-page"><div className="console-card-head"><div><span className="console-kicker">AUDIT TRAIL / SYSTEM</span><h2>System consequences.</h2><p>Immutable events generated by identity, access, asset, and role actions.</p></div><a className="console-link" href="/console/manager">← Manager dashboard</a></div><Block loading={audit.loading} error={audit.error}><AuditTable rows={auditToRows(audit.data ?? [])} /></Block></section>;
}

function ManagerConsole({ view }: { view: ManagerView }) {
  if (view === "access") return <ManagerAccessPage />;
  if (view === "assets") return <ManagerAssetsPage />;
  if (view === "audit") return <ManagerAuditPage />;
  return <ManagerDashboard />;
}

/* ---------------------------------------------------------------- */
/* ADMIN console                                                     */
/* ---------------------------------------------------------------- */

function AdminDashboard() {
  const users = useLoad(() => api.listUsers(), []);
  const audit = useLoad(() => api.listAudit(), []);
  return <><div className="console-stats"><Stat label="Total users" value={String((users.data ?? []).length).padStart(2, "0")} note="Registered identities" accent /><Stat label="Admins & managers" value={String((users.data ?? []).filter((u) => u.role === "ADMIN" || u.role === "MANAGER").length).padStart(2, "0")} note="Governance accounts" /><Stat label="Verified assets" value="—" note="Per asset detail" /><Stat label="Recent activity" value={String((audit.data ?? []).length).padStart(2, "0")} note="Recorded events" /></div><div className="console-two-col"><section className="console-card"><div className="console-card-head"><div><span className="console-kicker">USER MANAGEMENT / 01</span><h2>People and roles.</h2></div><a className="console-link" href="/console/admin/users">Open directory <ArrowRight size={13} /></a></div><div className="user-list">{(users.data ?? []).slice(0, 3).map((user) => <div className="user-row" key={user.id}><span className="user-avatar">{user.name[0]}</span><div><strong>{user.name}</strong><small>{shortHash(user.did, 8, 6) || "did:sv:pending"}</small></div><select defaultValue={user.role} aria-label={`Role for ${user.name}`} disabled><option>{user.role}</option></select></div>)}</div></section><section className="console-card admin-activity"><div className="console-card-head"><div><span className="console-kicker">GOVERNANCE / 02</span><h2>Administrative boundary.</h2></div></div><div className="admin-boundary"><ShieldCheck size={20} /><p>Role changes are explicit, auditable, and restricted to this console. The frontend hides mutation controls from USER and AUDITOR accounts.</p></div><div className="permission-lines"><div><span>USER</span><strong>Own assets · manage access</strong></div><div><span>MANAGER</span><strong>Grant access · verify assets</strong></div><div><span>AUDITOR</span><strong>Read evidence · verify chain</strong></div><div><span>ADMIN</span><strong>Manage users · change roles</strong></div></div></section></div><section className="console-card activity-card"><div className="console-card-head"><div><span className="console-kicker">RECENT ACTIVITY / 03</span><h2>System consequences.</h2></div><a className="console-link" href="/console/admin/audit">Open audit logs <ArrowRight size={13} /></a></div><Block loading={audit.loading} error={audit.error}><AuditTable rows={auditToRows((audit.data ?? []).slice(0, 3))} /></Block></section></>;
}

function AdminConsole({ view }: { view: AdminView }) {
  if (view === "dashboard") return <AdminDashboard />;
  const page = {
    users: { kicker: "USER MANAGEMENT / 01", title: "People and roles.", intro: "Review registered identities and assign the correct authority boundary." },
    roles: { kicker: "ROLE MANAGEMENT / 02", title: "Permission boundaries.", intro: "Define which actions each role can perform across the Samvid system." },
    assets: { kicker: "ASSET VIEWING / 03", title: "Every owned resource.", intro: "Inspect asset ownership, verification status, and the account behind each record." },
    audit: { kicker: "AUDIT LOGS / 04", title: "System consequences.", intro: "Review immutable events generated by identity, access, asset, and role actions." },
  }[view];
  const [revoked, setRevoked] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("trustvault.admin.revocations") || "{}"); } catch { return {}; }
  });
  const [confirming, setConfirming] = useState<{ key: string; label: string } | null>(null);
  const [revokeAudit, setRevokeAudit] = useState<string[][]>(() => {
    try { return JSON.parse(localStorage.getItem("trustvault.admin.revokeAudit") || "[]"); } catch { return []; }
  });
  const users = useLoad(() => api.listUsers(), []);
  const assets = useLoad(() => api.listAssets({ scope: "all" }), []);
  const audit = useLoad(() => api.listAudit(), []);
  const [busy, setBusy] = useState(false);
  const confirmAccessChange = () => {
    if (!confirming) return;
    const restoring = Boolean(revoked[confirming.key]);
    const next = { ...revoked };
    if (restoring) delete next[confirming.key]; else next[confirming.key] = true;
    const action = restoring ? "Access Restored" : "Access Revoked";
    const event = [new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }), "System admin", action, confirming.label, confirming.key];
    const nextAudit = [event, ...revokeAudit];
    setRevoked(next);
    setRevokeAudit(nextAudit);
    localStorage.setItem("trustvault.admin.revocations", JSON.stringify(next));
    localStorage.setItem("trustvault.admin.revokeAudit", JSON.stringify(nextAudit));
    setConfirming(null);
  };
  const changeRole = async (userId: string, role: string) => {
    setBusy(true);
    try { await api.updateUserRole(userId, role as URole); users.reload(); } finally { setBusy(false); }
  };
  const accessButton = (key: string, label: string) => <button className={revoked[key] ? "restore-button" : "revoke-button"} type="button" onClick={() => setConfirming({ key, label })}>{revoked[key] ? <Check size={13} /> : <Ban size={13} />} {revoked[key] ? "Restore access" : "Revoke access"}</button>;
  const isRestoring = confirming ? Boolean(revoked[confirming.key]) : false;
  return <section className="console-card admin-page"><div className="console-card-head"><div><span className="console-kicker">{page.kicker}</span><h2>{page.title}</h2><p>{page.intro}</p></div><a className="console-link" href="/console/admin">← Admin dashboard</a></div>{view === "users" && <div className="admin-directory"><div className="admin-toolbar"><strong>Registered identities</strong><span>{(users.data ?? []).length} accounts · revoke access available</span></div><Block loading={users.loading} error={users.error}>{users.data?.map((user) => <div className="admin-directory-row" key={user.id}><span className="user-avatar">{user.name[0]}</span><div><strong>{user.name}</strong><small>{user.email} · {shortHash(user.did, 8, 6)}</small></div><span className="role-pill">{user.role}</span><select className="role-select" value={user.role} disabled={busy} aria-label={`Role for ${user.name}`} onChange={(event) => changeRole(user.id, event.target.value)}><option>USER</option><option>MANAGER</option><option>AUDITOR</option><option>ADMIN</option></select><span className={`status-pill ${revoked[`user:${user.did}`] ? "revoked" : ""}`}>{revoked[`user:${user.did}`] ? "REVOKED" : user.status}</span>{accessButton(`user:${user.did}`, user.name)}</div>)}</Block></div>}{view === "roles" && <div className="permission-matrix"><div className="matrix-row matrix-head"><span>Capability</span><span>USER</span><span>MANAGER</span><span>AUDITOR</span><span>ADMIN</span></div>{[["View own assets", "Allowed", "Allowed", "Allowed", "Allowed"], ["Create asset", "Allowed", "Allowed", "Blocked", "Allowed"], ["Grant access", "Allowed", "Allowed", "Blocked", "Allowed"], ["Verify blockchain", "Allowed", "Allowed", "Allowed", "Allowed"], ["Delete asset", "Allowed", "Blocked", "Blocked", "Allowed"], ["Change user role", "Blocked", "Blocked", "Blocked", "Allowed"]].map(row => <div className="matrix-row" key={row[0]}>{row.map((cell, index) => <span key={`${row[0]}-${index}`} className={index > 0 ? cell === "Allowed" ? "allowed" : "blocked" : ""}>{cell}</span>)}</div>)}</div>}{view === "assets" && <div className="admin-asset-table"><div className="asset-table-head"><span>Asset</span><span>Owner</span><span>Type</span><span>Status</span><span>ID</span><span>Access</span></div><Block loading={assets.loading} error={assets.error}>{assets.data?.map((asset) => <div className="asset-table-row" key={asset.id}><span>{asset.name}</span><span>{asset.ownerName}</span><span>{assetTypeLabel(asset.type)}</span><span className={asset.status === "VERIFIED" ? "allowed" : "blocked"}>{asset.status}</span><span>{asset.id}</span>{accessButton(`asset:${asset.id}`, asset.name)}</div>)}</Block></div>}{view === "audit" && <Block loading={audit.loading} error={audit.error}><AuditTable rows={[...revokeAudit, ...auditToRows(audit.data ?? [])]} /></Block>}{confirming && <div className="revoke-confirm" role="alertdialog" aria-modal="true"><div><span className="console-kicker">ADMIN ACTION / CONFIRM</span><strong>{isRestoring ? "Restore access for" : "Revoke access for"} {confirming.label}?</strong><p>{isRestoring ? "This will restore the access relationship and create an audit event." : "This will mark the access relationship as revoked and create an audit event."} Continue only if this change is authorized.</p></div><div><button className={isRestoring ? "restore-confirm-button" : "revoke-confirm-button"} type="button" onClick={confirmAccessChange}>{isRestoring ? "Confirm restore" : "Confirm revoke"}</button><button className="cancel-submit" type="button" onClick={() => setConfirming(null)}>Cancel</button></div></div>}</section>;
}

/* ---------------------------------------------------------------- */
/* AUDITOR console                                                   */
/* ---------------------------------------------------------------- */

function AuditorPage({ kicker, title, intro, children }: { kicker: string; title: string; intro: string; children: React.ReactNode }) {
  return <section className="console-card auditor-page"><div className="console-card-head"><div><span className="console-kicker">{kicker}</span><h2>{title}</h2><p>{intro}</p></div><a className="console-link" href="/console/auditor">← Auditor dashboard</a></div>{children}</section>;
}

function AuditorConsole() {
  const route = window.location.pathname;
  const assets = useLoad(() => api.listAssets({ scope: "my" }), []);
  const audit = useLoad(() => api.listAudit(), []);
  const chain = useLoad(() => api.getBlockchainStatus(), []);
  const transactions = useLoad(() => api.listBlockchainTransactions(), []);
  if (route === "/console/auditor/assets") return <AuditorPage kicker="ASSET VERIFICATION / 01" title="Proof status, inspected." intro="Review ownership records, chain registration, and the current verification state of every asset."><div className="auditor-record-list"><Block loading={assets.loading} error={assets.error}>{(assets.data ?? []).map((asset) => <article className="auditor-record" key={asset.id}><div className={`verification-status ${asset.status === "VERIFIED" ? "verified" : "pending"}`}>{asset.status === "VERIFIED" ? <Check size={12} /> : <CircleAlert size={12} />}</div><div><strong>{asset.name}</strong><span>{asset.ownerName} · {asset.id}</span><small>{asset.nft ? `tx: ${shortHash(asset.nft.transactionHash, 6, 4)}` : "Awaiting registration"}</small></div><em className={asset.status === "VERIFIED" ? "allowed" : "blocked"}>{asset.status}</em><span className="auditor-readonly-tag">READ ONLY</span></article>)}</Block></div></AuditorPage>;
  if (route === "/console/auditor/audit") return <AuditorPage kicker="AUDIT LOGS / 02" title="Every action leaves evidence." intro="Inspect the immutable activity trail without changing identity, access, asset, or role records."><div className="auditor-filter-row"><span>{(audit.data ?? []).length} EVENTS SHOWN</span><span><i className="state-dot" /> READ-ONLY VIEW</span></div><Block loading={audit.loading} error={audit.error}><AuditTable rows={auditToRows(audit.data ?? [])} /></Block></AuditorPage>;
  if (route === "/console/auditor/blockchain") return <AuditorPage kicker="BLOCKCHAIN / 03" title="Chain state, readable." intro="Confirm that Samvid records are anchored, traceable, and ready for independent review."><div className="chain-summary"><div><span>NETWORK</span><strong>{chain.data?.network ?? "Samvid testnet"}</strong></div><div><span>LAST BLOCK</span><strong>#{chain.data?.blockNumber ?? 0}</strong></div><div><span>TRANSACTIONS</span><strong>{(transactions.data ?? []).length} confirmed</strong></div></div><Block loading={assets.loading || chain.loading || transactions.loading} error={assets.error || chain.error || transactions.error}><div className="chain-records">{(assets.data ?? []).filter((asset) => asset.nft).map((asset) => <div key={asset.id}><span className="verification-status verified"><Check size={12} /></span><div><strong>{asset.name}</strong><small>{shortHash(asset.nft?.transactionHash ?? "", 8, 6)} · block {chain.data?.blockNumber ?? 0} · confirmed</small></div><em>ANCHORED</em></div>)}{(assets.data ?? []).filter((asset) => !asset.nft).map((asset) => <div key={asset.id}><span className="verification-status pending"><CircleAlert size={12} /></span><div><strong>{asset.name}</strong><small>Pending chain registration</small></div><em>PENDING</em></div>)}</div></Block></AuditorPage>;
  return <><div className="console-stats"><Stat label="Audit events" value={String((audit.data ?? []).length).padStart(2, "0")} note="Inspectable records" accent /><Stat label="Your assets" value={String((assets.data ?? []).length).padStart(2, "0")} note="In scope for review" /><Stat label="Chain status" value={chain.data?.connected ? "ONLINE" : "OFFLINE"} note={chain.data?.network ?? "Backend reported"} /><Stat label="Mutation rights" value="00" note="Read-only role" /></div><div className="console-two-col"><section className="console-card"><div className="console-card-head"><div><span className="console-kicker">ASSET VERIFICATION / 01</span><h2>Proof status.</h2><p>Independent checks across the current Samvid asset register.</p></div><a className="console-link" href="/console/auditor/assets">Open verification <ArrowRight size={13} /></a></div><Block loading={assets.loading} error={assets.error}><div className="verification-list">{(assets.data ?? []).slice(0, 3).map((asset) => <div key={asset.id}><span className={`verification-status ${asset.status === "VERIFIED" ? "verified" : "pending"}`}>{asset.status === "VERIFIED" ? <Check size={12} /> : <CircleAlert size={12} />}</span><div><strong>{asset.name}</strong><small>{asset.id} · {asset.nft ? `tx: ${shortHash(asset.nft.transactionHash, 6, 4)}` : "awaiting registration"}</small></div><em>{asset.status === "VERIFIED" ? "REGISTERED" : "PENDING"}</em></div>)}</div></Block></section><section className="console-card read-only-card"><div className="console-card-head"><div><span className="console-kicker">AUDITOR BOUNDARY</span><h2>Inspect, never mutate.</h2><p>This console is intentionally read-only.</p></div></div><div className="read-only-message"><Ban size={20} /><p>Asset creation, deletion, access grants, and role changes are unavailable to this account.</p></div><div className="restricted-actions"><button disabled><FilePlus2 size={14} /> Create asset</button><button disabled><UserCog size={14} /> Change role</button><button disabled><Lock size={14} /> Grant access</button></div></section></div><section className="console-card activity-card"><div className="console-card-head"><div><span className="console-kicker">AUDIT LOG / 02</span><h2>Inspectable history.</h2><p>Recent evidence events from the Samvid system.</p></div><a className="console-link" href="/console/auditor/audit">View full log <ArrowRight size={13} /></a></div><Block loading={audit.loading} error={audit.error}><AuditTable rows={auditToRows((audit.data ?? []).slice(0, 3))} /></Block></section></>;
}

/* ---------------------------------------------------------------- */
/* Shell                                                             */
/* ---------------------------------------------------------------- */

function AuditTable({ rows }: { rows: string[][] }) {
  return <div className="audit-table"><div className="audit-head"><span>Timestamp</span><span>User</span><span>Action</span><span>Resource</span><span>Resource ID</span></div>{rows.map(row => <div className="audit-row" key={row.join("-")}>{row.map((cell, index) => <span key={`${cell}-${index}`}>{cell}</span>)}</div>)}</div>;
}

export function RoleConsole({ role }: ConsoleProps) {
  const meta = roleMeta[role];
  const path = window.location.pathname;
  const sessionEmail = getSession()?.email ?? "guest@samvid.local";
  let userView: UserView = "dashboard";
  if (role === "user") {
    if (path === "/console/user/create") userView = "create";
    else if (path === "/console/user/assets") userView = "assets";
    else if (path.startsWith("/console/user/assets/")) userView = "asset-detail";
    else if (path === "/console/user/access") userView = "access";
    else if (path === "/console/user/audit") userView = "audit";
    else if (path === "/console/user/identity/edit") userView = "identity-edit";
  }
  const managerView: ManagerView = path === "/console/manager/access" ? "access" : path === "/console/manager/assets" ? "assets" : path === "/console/manager/audit" ? "audit" : "dashboard";
  const adminPath = path.split("/").pop();
  const adminView: AdminView = adminPath === "users" ? "users" : adminPath === "roles" ? "roles" : adminPath === "assets" ? "assets" : adminPath === "audit" ? "audit" : "dashboard";
  return <div className="console-shell"><aside className="console-sidebar"><a className="console-brand" href="/"><img src="/brand/samvid-logo.png" alt="Samvid logo" /><strong>SAMVID</strong></a><div className="console-sidebar-role"><span className="console-role-dot" />{meta.label}<small>PERMISSION SCOPE</small></div><NetworkStatus /><ConsoleNav role={role} /><div className="console-sidebar-foot"><SignOutLink /><a className="console-exit" href="/">← Exit to field</a></div></aside><main className="console-main"><ConsoleHeader role={role} />{role === "user" ? <UserConsole email={sessionEmail} role={role} view={userView} /> : role === "manager" ? <ManagerConsole view={managerView} /> : role === "admin" ? <AdminConsole view={adminView} /> : <AuditorConsole />}<footer className="console-footer"><span>SAMVID / {meta.label} / FRONTEND ROLE GUARD</span><span>BACKEND REMAINS SOURCE OF TRUTH</span></footer></main></div>;
}

export default RoleConsole;