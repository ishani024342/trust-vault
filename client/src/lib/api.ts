/* Samvid API client.
 *
 * Talks to the REST backend configured via VITE_API_BASE_URL (the contract in
 * lib/types.ts). When no backend is configured the client falls back to a
 * seeded local store in localStorage so every console view remains fully
 * functional in demo mode. Mutations always record audit events, mirroring the
 * backend's "immutable audit history" behaviour.
 */
import { getSession, getToken, setSession, setToken } from "./auth";
import type {
  Asset,
  AssetStatus,
  AssetType,
  AuditEvent,
  AuthResponse,
  BlockchainStatus,
  BlockchainTransaction,
  DashboardStats,
  Grant,
  GrantStatus,
  Identity,
  Permission,
  Role,
  User,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "");
export const isRemote = Boolean(API_BASE);

export const accountStorageKey = (email: string) => `trustvault.account.${email.trim().toLowerCase()}`;

/* ------------------------------------------------------------------ */
/* Remote transport                                                    */
/* ------------------------------------------------------------------ */

function mapKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mapKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      out[camel] = mapKeys(val);
    }
    return out;
  }
  return value;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error((data && (data.message || data.error)) || `Request failed (${response.status})`);
  return mapKeys(data) as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

/* ------------------------------------------------------------------ */
/* Local fallback store                                                */
/* ------------------------------------------------------------------ */

const DB_KEY = "samvid.local.db";

export interface LocalAccountState {
  assets: { name: string; type: string; date: string; status: string; id: string }[];
  activity: [string, string, string][];
}

interface LocalDb {
  users: User[];
  assets: Asset[];
  grants: Grant[];
  audit: AuditEvent[];
  transactions: BlockchainTransaction[];
  identityOverrides: Record<string, Partial<Identity>>;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function iso(daysAgo = 0, hour = 9, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function seedDb(): LocalDb {
  const now = Date.now();
  const did = (seed: string) => `did:sv:${seed}`;
  const tx = (seed: string) => `0x${seed}…${seed.slice(-4)}`;
  const users: User[] = [
    { id: "USR-0001", name: "Ishani Kaur", email: "ishani@samvid.local", role: "USER", did: did("0f64b7c1408c"), status: "ACTIVE", createdAt: iso(220) },
    { id: "USR-0002", name: "Arjun Mehta", email: "arjun@samvid.local", role: "AUDITOR", did: did("98a1d02"), status: "ACTIVE", createdAt: iso(210) },
    { id: "USR-0003", name: "Naina Singh", email: "naina@samvid.local", role: "USER", did: did("6b31c921"), status: "PENDING", createdAt: iso(4) },
    { id: "USR-0004", name: "Kabir Shah", email: "kabir@samvid.local", role: "ADMIN", did: did("31eff802"), status: "ACTIVE", createdAt: iso(300) },
    { id: "USR-0005", name: "Riya Verma", email: "riya@samvid.local", role: "MANAGER", did: did("5c22e7b3"), status: "ACTIVE", createdAt: iso(160) },
  ];
  const owner = (email: string) => {
    const u = users.find((x) => x.email === email)!;
    return { ownerName: u.name, ownerEmail: u.email, ownerDid: u.did };
  };
  const assets: Asset[] = [
    {
      id: "AST-0001", name: "Identity passport", type: "DOCUMENT", description: "Verified identity record issued to the account holder.", ...owner("ishani@samvid.local"),
      status: "VERIFIED", createdAt: iso(10), updatedAt: iso(2),
      nft: { tokenId: "1", contractAddress: "0x7b0d…3f91", transactionHash: tx("8a2f91"), network: "Hardhat Local", status: "VERIFIED", mintedAt: iso(2) },
    },
    {
      id: "AST-0002", name: "Ownership certificate", type: "CERTIFICATE", description: "On-chain ownership proof for the platform record.", ...owner("ishani@samvid.local"),
      status: "VERIFIED", createdAt: iso(9), updatedAt: iso(2),
      nft: { tokenId: "2", contractAddress: "0x7b0d…3f91", transactionHash: tx("44c2a0"), network: "Hardhat Local", status: "VERIFIED", mintedAt: iso(2) },
    },
    {
      id: "AST-0003", name: "Access manifest", type: "ACCESS_MANIFEST", description: "Boundary manifest awaiting chain registration.", ...owner("naina@samvid.local"),
      status: "PENDING", createdAt: iso(1), updatedAt: iso(0, 11),
    },
    {
      id: "AST-0004", name: "Research credential", type: "CREDENTIAL", description: "Credential issued after verified research clearance.", ...owner("arjun@samvid.local"),
      status: "VERIFIED", createdAt: iso(14), updatedAt: iso(3),
      nft: { tokenId: "3", contractAddress: "0x7b0d…3f91", transactionHash: tx("19d7a4"), network: "Hardhat Local", status: "VERIFIED", mintedAt: iso(3) },
    },
    {
      id: "AST-0005", name: "Equipment clearance", type: "CERTIFICATE", description: "Hardware clearance bound to the holder identity.", ...owner("riya@samvid.local"),
      status: "VERIFIED", createdAt: iso(7), updatedAt: iso(1),
      nft: { tokenId: "4", contractAddress: "0x7b0d…3f91", transactionHash: tx("2be11c"), network: "Hardhat Local", status: "VERIFIED", mintedAt: iso(1) },
    },
    {
      id: "AST-0006", name: "Legacy key archive", type: "OTHER", description: "Archived key material pending migration review.", ...owner("kabir@samvid.local"),
      status: "PENDING", createdAt: iso(5), updatedAt: iso(0, 8),
    },
  ];
  const grants: Grant[] = [
    { id: "GRT-0001", assetId: "AST-0001", assetName: "Identity passport", userId: "USR-0003", userEmail: "naina@samvid.local", userName: "Naina Singh", userDid: did("6b31c921"), permission: "READ", status: "ACTIVE", grantedBy: "Ishani Kaur", grantedAt: iso(3) },
    { id: "GRT-0002", assetId: "AST-0001", assetName: "Identity passport", userId: "USR-0002", userEmail: "arjun@samvid.local", userName: "Arjun Mehta", userDid: did("98a1d02"), permission: "UPDATE", status: "ACTIVE", grantedBy: "Ishani Kaur", grantedAt: iso(4) },
    { id: "GRT-0003", assetId: "AST-0002", assetName: "Ownership certificate", userId: "USR-0003", userEmail: "naina@samvid.local", userName: "Naina Singh", userDid: did("6b31c921"), permission: "READ", status: "REVOKED", grantedBy: "Ishani Kaur", grantedAt: iso(6) },
    { id: "GRT-0004", assetId: "AST-0003", assetName: "Access manifest", userId: "USR-0001", userEmail: "ishani@samvid.local", userName: "Ishani Kaur", userDid: did("0f64b7c1408c"), permission: "READ", status: "PENDING", grantedBy: "Naina Singh", grantedAt: iso(0, 9) },
  ];
  const event = (daysAgo: number, actorEmail: string, action: string, resourceType: string, resourceId: string, resourceName: string, extra: Partial<AuditEvent> = {}): AuditEvent => {
    const actor = users.find((u) => u.email === actorEmail);
    return { id: `EVT-${pad(daysAgo)}${pad(now % 97)}`, timestamp: iso(daysAgo), actorName: actor?.name ?? "System admin", actorEmail, action, resourceType, resourceId, resourceName, ...extra };
  };
  const audit: AuditEvent[] = [
    event(0, "ishani@samvid.local", "ASSET_CREATED", "ASSET", "AST-0003", "Access manifest"),
    event(1, "naina@samvid.local", "ACCESS_GRANTED", "GRANT", "GRT-0004", "Identity passport", { metadata: { permission: "READ" } }),
    event(1, "ishani@samvid.local", "ASSET_MINTED", "ASSET", "AST-0005", "Equipment clearance", { transactionHash: tx("2be11c") }),
    event(2, "ishani@samvid.local", "ASSET_VERIFIED", "ASSET", "AST-0002", "Ownership certificate", { transactionHash: tx("44c2a0") }),
    event(3, "kabir@samvid.local", "ACCESS_GRANTED", "GRANT", "GRT-0001", "Identity passport", { metadata: { permission: "READ" } }),
    event(4, "kabir@samvid.local", "ROLE_CHANGED", "USER", "USR-0005", "Riya Verma", { metadata: { role: "MANAGER" } }),
    event(5, "kabir@samvid.local", "USER_ENABLED", "USER", "USR-0004", "Kabir Shah"),
    event(6, "ishani@samvid.local", "ACCESS_REVOKED", "GRANT", "GRT-0003", "Ownership certificate", { metadata: { permission: "READ" } }),
    event(7, "arjun@samvid.local", "IDENTITY_VERIFIED", "IDENTITY", "USR-0002", "Arjun Mehta"),
    event(8, "kabir@samvid.local", "ASSET_TRANSFERRED", "ASSET", "AST-0004", "Research credential", { metadata: { to: "arjun@samvid.local" } }),
  ];
  const transactions: BlockchainTransaction[] = assets.filter((a) => a.nft).map((a, i) => ({
    hash: a.nft?.transactionHash ?? "0x",
    type: i % 2 === 0 ? "ASSET_MINT" : "ASSET_VERIFY",
    resourceName: a.name,
    resourceId: a.id,
    status: "CONFIRMED",
    blockNumber: 1284 - i,
    timestamp: a.nft!.mintedAt ?? a.updatedAt,
  }));
  return { users, assets, grants, audit, transactions, identityOverrides: {} };
}

function readDb(): LocalDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as LocalDb;
  } catch {
    /* fall through to reseed */
  }
  const db = seedDb();
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* ignore quota errors */
  }
  return db;
}

function writeDb(db: LocalDb): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* ignore quota errors */
  }
}

function withDb<T>(mutate: (db: LocalDb) => T): T {
  const db = readDb();
  const result = mutate(db);
  writeDb(db);
  return result;
}

function actor(): { name: string; email: string } {
  const session = getSession();
  return { name: session?.name ?? "System admin", email: session?.email ?? "system@samvid.local" };
}

function recordEvent(db: LocalDb, action: string, resourceType: string, resourceId: string, resourceName: string, extra: Partial<AuditEvent> = {}): void {
  const who = actor();
  db.audit.unshift({
    id: `EVT-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    actorName: who.name,
    actorEmail: who.email,
    action,
    resourceType,
    resourceId,
    resourceName,
    ...extra,
  });
}

function readAccount(email: string): LocalAccountState {
  try {
    const saved = localStorage.getItem(accountStorageKey(email));
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<LocalAccountState>;
      return {
        assets: Array.isArray(parsed.assets) ? parsed.assets : [],
        activity: Array.isArray(parsed.activity) ? (parsed.activity as [string, string, string][]) : [],
      };
    }
  } catch {
    /* ignore */
  }
  return { assets: [], activity: [] };
}

function writeAccount(email: string, state: LocalAccountState): void {
  try {
    localStorage.setItem(accountStorageKey(email), JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

function accountToAsset(email: string, row: LocalAccountState["assets"][number]): Asset {
  const session = getSession();
  return {
    id: row.id,
    name: row.name,
    type: (row.type.toUpperCase().includes("NFT") ? "CERTIFICATE" : "DOCUMENT") as AssetType,
    description: "Recorded through the Samvid owner console.",
    ownerName: session?.name ?? email,
    ownerEmail: email,
    ownerDid: session?.did ?? "",
    status: row.status.toLowerCase().includes("verified") ? "VERIFIED" : "PENDING",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const permissionFromType = (type: string): Permission =>
  type.toUpperCase().includes("ACCESS") ? "READ" : type.toUpperCase().includes("CERT") || type.toUpperCase().includes("NFT") ? "UPDATE" : "READ";

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface CreateAssetInput {
  name: string;
  type: AssetType;
  description: string;
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  fileHash?: string;
  storageRef?: string;
}

export interface GrantInput {
  assetId: string;
  userId: string;
  permission: Permission;
}

export const api = {
  /* Auth */
  async login(email: string, password: string): Promise<AuthResponse> {
    if (isRemote) {
      const response = await post<AuthResponse>("/auth/login", { email, password });
      setToken(response.token);
      setSession({
        name: response.user?.name,
        email: response.user?.email ?? email,
        role: response.user?.role ?? "USER",
        userId: response.user?.id,
        did: response.user?.did,
      });
      return response;
    }
    const db = readDb();
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    const role = user?.role ?? (email.toLowerCase().includes("admin") ? "ADMIN" : email.toLowerCase().includes("audit") ? "AUDITOR" : email.toLowerCase().includes("manager") ? "MANAGER" : "USER");
    const session = { name: user?.name, email: email.trim(), role, userId: user?.id, did: user?.did, local: true };
    setSession(session);
    return { token: "local", user: user ?? { id: "USR-LOCAL", name: email.split("@")[0], email, role, did: "", status: "ACTIVE", createdAt: new Date().toISOString() } };
  },

  /* Users */
  async listUsers(): Promise<User[]> {
    if (isRemote) return get<User[]>("/users");
    return [...readDb().users];
  },

  async updateUserRole(userId: string, role: Role): Promise<User> {
    if (isRemote) return patch<User>(`/users/${userId}/role`, { role });
    return withDb((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new Error("User not found");
      user.role = role;
      recordEvent(db, "ROLE_CHANGED", "USER", user.id, user.name, { metadata: { role } });
      return { ...user };
    });
  },

  async setUserStatus(userId: string, status: User["status"]): Promise<User> {
    if (isRemote) return patch<User>(`/users/${userId}/status`, { status });
    return withDb((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new Error("User not found");
      user.status = status;
      recordEvent(db, status === "ACTIVE" ? "USER_ENABLED" : "USER_DISABLED", "USER", user.id, user.name);
      return { ...user };
    });
  },

  /* Identity */
  async getIdentity(): Promise<Identity> {
    if (isRemote) return get<Identity>("/identities/me");
    const session = getSession();
    const email = session?.email ?? "guest@samvid.local";
    const db = readDb();
    const override = db.identityOverrides[email.toLowerCase()];
    const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return {
      id: user?.id ?? "USR-LOCAL",
      name: override?.name ?? session?.name ?? user?.name ?? email.split("@")[0],
      email,
      role: user?.role ?? session?.role ?? "USER",
      did: override?.did ?? session?.did ?? user?.did ?? "did:sv:pending",
      status: user?.status ?? "ACTIVE",
      verified: (user?.status ?? "ACTIVE") === "ACTIVE",
      createdAt: user?.createdAt ?? new Date().toISOString(),
      lastProofAt: user ? iso(1) : undefined,
    };
  },

  async updateIdentity(input: { name: string; did: string }): Promise<Identity> {
    if (isRemote) return patch<Identity>("/identities/me", input);
    const session = getSession();
    const email = session?.email ?? "guest@samvid.local";
    return withDb((db) => {
      db.identityOverrides[email.toLowerCase()] = { name: input.name, did: input.did };
      setSession({ ...(session ?? { email, role: "USER" }), name: input.name, did: input.did });
      recordEvent(db, "IDENTITY_VERIFIED", "IDENTITY", "USR-LOCAL", input.name);
      return { id: "USR-LOCAL", name: input.name, email, role: session?.role ?? "USER", did: input.did, status: "ACTIVE", verified: true, createdAt: new Date().toISOString(), lastProofAt: new Date().toISOString() };
    });
  },

  /* Assets */
  async listAssets(scope?: { ownerEmail?: string }): Promise<Asset[]> {
    if (isRemote) return get<Asset[]>("/assets");
    const db = readDb();
    let assets = [...db.assets];
    if (scope?.ownerEmail) {
      const email = scope.ownerEmail.toLowerCase();
      assets = db.assets.filter((a) => a.ownerEmail.toLowerCase() === email);
      const account = readAccount(email);
      for (const row of account.assets) {
        if (!assets.some((a) => a.id === row.id)) assets.push(accountToAsset(email, row));
      }
    }
    return assets;
  },

  async getAsset(id: string): Promise<Asset | null> {
    if (isRemote) return get<Asset>(`/assets/${id}`).catch(() => null);
    const session = getSession();
    const db = readDb();
    const asset = db.assets.find((a) => a.id === id);
    if (asset) return { ...asset };
    const email = session?.email ?? "guest@samvid.local";
    const row = readAccount(email).assets.find((a) => a.id === id);
    return row ? accountToAsset(email, row) : null;
  },

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    if (isRemote) return post<Asset>("/assets", input);
    const session = getSession();
    const email = session?.email ?? "guest@samvid.local";
    return withDb((db) => {
      const id = `AST-${String(Date.now()).slice(-4)}`;
      const asset: Asset = {
        id,
        name: input.name,
        type: input.type,
        description: input.description,
        ownerName: session?.name ?? email.split("@")[0],
        ownerEmail: email,
        ownerDid: session?.did ?? "",
        status: "PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fileName: input.fileName,
        fileSize: input.fileSize,
        contentType: input.contentType,
        fileHash: input.fileHash,
        storageRef: input.storageRef,
      };
      db.assets.unshift(asset);
      recordEvent(db, "ASSET_CREATED", "ASSET", asset.id, asset.name);
      return { ...asset };
    });
  },

  async verifyAsset(id: string): Promise<Asset> {
    if (isRemote) return post<Asset>(`/assets/${id}/verify`);
    return withDb((db) => {
      const asset = db.assets.find((a) => a.id === id);
      if (!asset) throw new Error("Asset not found");
      asset.status = "VERIFIED";
      asset.updatedAt = new Date().toISOString();
      asset.nft = { ...(asset.nft ?? {}), status: "VERIFIED" } as Asset["nft"];
      recordEvent(db, "ASSET_VERIFIED", "ASSET", asset.id, asset.name);
      return { ...asset };
    });
  },

  async mintAsset(id: string): Promise<Asset> {
    if (isRemote) return post<Asset>(`/assets/${id}/mint`);
    return withDb((db) => {
      const asset = db.assets.find((a) => a.id === id);
      if (!asset) throw new Error("Asset not found");
      asset.status = "VERIFIED";
      asset.updatedAt = new Date().toISOString();
      asset.nft = {
        tokenId: String(db.assets.filter((a) => a.nft).length + 1),
        contractAddress: "0x7b0d…3f91",
        transactionHash: `0x${Math.random().toString(16).slice(2, 6)}…${Math.random().toString(16).slice(2, 6)}`,
        network: "Hardhat Local",
        status: "VERIFIED",
        mintedAt: new Date().toISOString(),
      };
      recordEvent(db, "ASSET_MINTED", "ASSET", asset.id, asset.name, { transactionHash: asset.nft.transactionHash });
      return { ...asset };
    });
  },

  async transferAsset(id: string, toEmail: string): Promise<Asset> {
    if (isRemote) return post<Asset>(`/assets/${id}/transfer`, { toEmail });
    return withDb((db) => {
      const asset = db.assets.find((a) => a.id === id);
      if (!asset) throw new Error("Asset not found");
      const to = db.users.find((u) => u.email.toLowerCase() === toEmail.trim().toLowerCase());
      if (!to) throw new Error("Recipient account not found");
      asset.ownerName = to.name;
      asset.ownerEmail = to.email;
      asset.ownerDid = to.did;
      asset.updatedAt = new Date().toISOString();
      recordEvent(db, "ASSET_TRANSFERRED", "ASSET", asset.id, asset.name, { metadata: { to: to.email } });
      return { ...asset };
    });
  },

  async deleteAsset(id: string): Promise<void> {
    if (isRemote) return del<void>(`/assets/${id}`);
    return withDb((db) => {
      const index = db.assets.findIndex((a) => a.id === id);
      if (index === -1) throw new Error("Asset not found");
      const [removed] = db.assets.splice(index, 1);
      recordEvent(db, "ASSET_DELETED", "ASSET", removed.id, removed.name);
    });
  },

  /* Grants */
  async listGrants(): Promise<Grant[]> {
    if (isRemote) return get<Grant[]>("/grants");
    return [...readDb().grants];
  },

  async createGrant(input: GrantInput): Promise<Grant> {
    if (isRemote) return post<Grant>("/grants", input);
    return withDb((db) => {
      const asset = db.assets.find((a) => a.id === input.assetId);
      const user = db.users.find((u) => u.id === input.userId);
      if (!asset || !user) throw new Error("Asset or account not found");
      const grant: Grant = {
        id: `GRT-${String(Date.now()).slice(-4)}`,
        assetId: asset.id,
        assetName: asset.name,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        userDid: user.did,
        permission: input.permission,
        status: "ACTIVE",
        grantedBy: actor().name,
        grantedAt: new Date().toISOString(),
      };
      db.grants.unshift(grant);
      recordEvent(db, "ACCESS_GRANTED", "GRANT", grant.id, asset.name, { metadata: { permission: input.permission, user: user.email } });
      return { ...grant };
    });
  },

  async revokeGrant(id: string): Promise<Grant> {
    if (isRemote) return post<Grant>(`/grants/${id}/revoke`);
    return withDb((db) => {
      const grant = db.grants.find((g) => g.id === id);
      if (!grant) throw new Error("Grant not found");
      grant.status = "REVOKED";
      recordEvent(db, "ACCESS_REVOKED", "GRANT", grant.id, grant.assetName, { metadata: { permission: grant.permission, user: grant.userEmail } });
      return { ...grant };
    });
  },

  /* Audit */
  async listAudit(): Promise<AuditEvent[]> {
    if (isRemote) return get<AuditEvent[]>("/audit");
    const db = readDb();
    const session = getSession();
    const email = session?.email?.toLowerCase();
    let events = [...db.audit];
    if (email) {
      const account = readAccount(email);
      for (const [subject, detail, when] of account.activity) {
        events.push({
          id: `EVT-ACCT-${events.length}-${Date.now().toString(36)}`,
          timestamp: when === "just now" ? new Date().toISOString() : iso(0),
          actorName: session?.name ?? email,
          actorEmail: session?.email ?? email,
          action: subject.toUpperCase().replace(/\s+/g, "_"),
          resourceType: "ASSET",
          resourceId: detail,
          resourceName: detail,
        });
      }
    }
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  /* Blockchain */
  async getBlockchainStatus(): Promise<BlockchainStatus> {
    if (isRemote) return get<BlockchainStatus>("/blockchain/status");
    return { connected: true, network: "Hardhat Local", blockNumber: 1284, lastSyncAt: new Date().toISOString() };
  },

  async listBlockchainTransactions(): Promise<BlockchainTransaction[]> {
    if (isRemote) return get<BlockchainTransaction[]>("/blockchain/transactions");
    return [...readDb().transactions];
  },

  /* Stats */
  async getStats(): Promise<DashboardStats> {
    if (isRemote) return get<DashboardStats>("/stats");
    const db = readDb();
    return {
      totalAssets: db.assets.length,
      verifiedAssets: db.assets.filter((a) => a.status === "VERIFIED" && a.nft).length,
      totalGrants: db.grants.length,
      totalUsers: db.users.length,
      pendingAssets: db.assets.filter((a) => a.status === "PENDING").length,
      recentActivity: db.audit.length,
    };
  },
};

/** Small helper used by consoles: pretty-print an asset type for display. */
export function assetTypeLabel(type: AssetType): string {
  switch (type) {
    case "ACCESS_MANIFEST": return "Access manifest";
    case "CERTIFICATE": return "Certificate";
    case "CREDENTIAL": return "Credential";
    case "DOCUMENT": return "Document";
    default: return "Record";
  }
}

export { permissionFromType };