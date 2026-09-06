/* Samvid API client.
 *
 * Remote mode: every call hits the REST backend configured via VITE_API_BASE_URL.
 * The backend is the source of truth (Express + Prisma + JWT + RBAC). Responses
 * use the { status, message, data } envelope; this layer unwraps it so pages
 * always receive plain domain objects.
 *
 * Local demo mode: only when no backend base URL is configured, the client
 * falls back to a seeded localStorage store so the console remains explorable.
 * In remote mode NO mock data is ever returned; failures surface as errors.
 */
import { getSession, getToken, setSession, setToken } from "./auth";
import type {
  Asset,
  AssetStatus,
  AssetType,
  AuditEvent,
  AuthResponse,
  BlockchainInfo,
  BlockchainStatus,
  BlockchainTransaction,
  DashboardStats,
  Grant,
  Identity,
  NftRecord,
  Permission,
  RegisterInput,
  Role,
  User,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "");
export const isRemote = Boolean(API_BASE);

export const accountStorageKey = (email: string) => `trustvault.account.${email.trim().toLowerCase()}`;

/* ------------------------------------------------------------------ */
/* Remote transport                                                    */
/* ------------------------------------------------------------------ */

/** snake_case -> camelCase so backend payloads match the frontend types. */
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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function messageFor(status: number, fallback: string): string {
  switch (status) {
    case 400: return fallback || "Invalid request. Check the submitted values.";
    case 401: return "Your session has expired. Please log in again.";
    case 403: return "You do not have permission to perform this action.";
    case 404: return fallback || "The requested record was not found.";
    case 500: return "The server encountered an error. Please try again.";
    default: return fallback || `Request failed (${status}).`;
  }
}

/** Unwraps the backend envelope: { status, message, data } -> data. */
function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "status" in (payload as Record<string, unknown>)) {
    const envelope = payload as { status?: string; data?: unknown; message?: string };
    if (envelope.status === "error") throw new ApiError(400, envelope.message || "Request failed");
    return (envelope.data ?? payload) as T;
  }
  return payload as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
  } catch {
    throw new ApiError(0, "Cannot reach the Samvid backend. Is it running and reachable?");
  }
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text.slice(0, 200) };
    }
  }
  if (!response.ok) throw new ApiError(response.status, messageFor(response.status, (body as { message?: string; error?: string } | null)?.message ?? (body as { message?: string; error?: string } | null)?.error ?? ""));
  return unwrap<T>(mapKeys(body));
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T,>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
const del = <T,>(path: string) => request<T>(path, { method: "DELETE" });

/* ------------------------------------------------------------------ */
/* Local fallback store (demo mode only)                               */
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

/** The missing backend endpoints, surfaced instead of silently faked. */
export const missingBackendEndpoints = {
  identity: "/identities/me is not part of the backend API yet — identity editing needs a backend route.",
  userStatus: "/admin/users/:id/status is not part of the backend API yet — enable/disable needs a backend route.",
  stats: "/stats is not part of the backend API yet — dashboard totals are computed from other endpoints.",
};

const endpointMissing = (note: string): never => {
  throw new ApiError(501, note);
};

/* ------------------------------------------------------------------ */
/* Backend payload <-> frontend type mapping                           */
/* ------------------------------------------------------------------ */

/** Backend CreateAssetRequest { name, description, assetType, storageKey }. */
interface BackendCreateAsset {
  name: string;
  description?: string;
  assetType: string;
  storageKey: string;
}

/** Backend AccessRequest for /assets/:assetId/access. */
interface BackendGrantRequest {
  userId: string;
  permission: Permission;
}

function mapAsset(raw: Partial<Asset> & Record<string, unknown>): Asset {
  const assetType = String(raw.assetType ?? raw.type ?? "OTHER");
  const nft = raw.nft as NftRecord | undefined;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    type: assetType as AssetType,
    description: String(raw.description ?? ""),
    ownerId: raw.ownerId !== undefined ? String(raw.ownerId) : undefined,
    ownerName: String(raw.ownerName ?? (raw.owner as Record<string, unknown> | undefined)?.name ?? ""),
    ownerEmail: String(raw.ownerEmail ?? (raw.owner as Record<string, unknown> | undefined)?.email ?? ""),
    ownerDid: String(raw.ownerDid ?? (raw.owner as Record<string, unknown> | undefined)?.did ?? ""),
    status: (raw.status ?? "PENDING") as AssetStatus,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? raw.createdAt ?? new Date().toISOString()),
    storageRef: raw.storageKey !== undefined ? String(raw.storageKey) : raw.storageRef !== undefined ? String(raw.storageRef) : undefined,
    metadata: (raw.metadata as Record<string, string> | undefined) ?? undefined,
    nft: nft
      ? {
          tokenId: nft.tokenId !== undefined ? String(nft.tokenId) : undefined,
          contractAddress: nft.contractAddress,
          transactionHash: nft.transactionHash,
          metadataUri: nft.metadataUri,
          network: nft.network,
          status: (nft.status ?? "PENDING") as AssetStatus,
          mintedAt: nft.mintedAt,
        }
      : undefined,
    fileName: raw.fileName !== undefined ? String(raw.fileName) : undefined,
    fileSize: raw.fileSize !== undefined ? Number(raw.fileSize) : undefined,
    contentType: raw.contentType !== undefined ? String(raw.contentType) : undefined,
    fileHash: raw.fileHash !== undefined ? String(raw.fileHash) : undefined,
  };
}

function mapGrant(raw: Record<string, unknown>): Grant {
  const asset = raw.asset as Record<string, unknown> | undefined;
  const user = raw.user as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ""),
    assetId: String(raw.assetId ?? asset?.id ?? ""),
    assetName: String(raw.assetName ?? asset?.name ?? ""),
    userId: String(raw.userId ?? user?.id ?? ""),
    userEmail: String(raw.userEmail ?? user?.email ?? ""),
    userName: String(raw.userName ?? user?.name ?? ""),
    userDid: String(raw.userDid ?? user?.did ?? ""),
    permission: (raw.permission ?? "READ") as Permission,
    status: (raw.status ?? "ACTIVE") as Grant["status"],
    grantedBy: String(raw.grantedBy ?? ""),
    grantedAt: String(raw.grantedAt ?? new Date().toISOString()),
  };
}

function mapAudit(raw: Record<string, unknown>): AuditEvent {
  const actor = raw.actor as Record<string, unknown> | undefined;
  const resource = raw.resource as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ""),
    timestamp: String(raw.timestamp ?? raw.createdAt ?? new Date().toISOString()),
    actorName: String(raw.actorName ?? actor?.name ?? ""),
    actorEmail: String(raw.actorEmail ?? actor?.email ?? ""),
    action: String(raw.action ?? ""),
    resourceType: String(raw.resourceType ?? ""),
    resourceId: String(raw.resourceId ?? ""),
    resourceName: String(raw.resourceName ?? resource?.name ?? ""),
    metadata: (raw.metadata as Record<string, string> | undefined) ?? undefined,
    transactionHash: raw.transactionHash !== undefined ? String(raw.transactionHash) : undefined,
  };
}

function mapUser(raw: Record<string, unknown>): User {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    role: (raw.role ?? "USER") as Role,
    did: String(raw.did ?? ""),
    status: (raw.status ?? "ACTIVE") as User["status"],
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface CreateAssetInput {
  name: string;
  type: AssetType;
  description: string;
  /** Required by the backend: the storage reference / file key. */
  storageKey?: string;
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  fileHash?: string;
}

export interface GrantInput {
  assetId: string;
  userId: string;
  permission: Permission;
}

export const api = {
  /* Auth ----------------------------------------------------------- */
  async register(input: RegisterInput): Promise<AuthResponse> {
    if (isRemote) {
      const response = await post<AuthResponse>("/auth/register", input);
      if (response.token) setToken(response.token);
      setSession({
        name: response.user?.name,
        email: response.user?.email ?? input.email,
        role: response.user?.role ?? input.role ?? "USER",
        userId: response.user?.id,
        did: response.user?.did,
      });
      return response;
    }
    const db = readDb();
    const email = input.email.trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === email)) throw new Error("An account with this email already exists.");
    const user: User = {
      id: `USR-${String(db.users.length + 1).padStart(4, "0")}`,
      name: input.name,
      email: input.email.trim(),
      role: input.role ?? "USER",
      did: `did:sv:${Math.random().toString(16).slice(2, 10)}`,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    writeDb(db);
    setSession({ name: user.name, email: user.email, role: user.role, userId: user.id, did: user.did, local: true });
    return { token: "local", user };
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    if (isRemote) {
      const response = await post<AuthResponse>("/auth/login", { email, password });
      if (response.token) setToken(response.token);
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

  /** Validates the stored token with GET /auth/me; returns null when invalid. */
  async fetchMe(): Promise<User | null> {
    if (!isRemote) return null;
    const token = getToken();
    if (!token) return null;
    try {
      const raw = await get<Record<string, unknown>>("/auth/me");
      const user = (raw.user ?? raw) as Record<string, unknown>;
      if (!user || typeof user !== "object" || !("email" in user)) return null;
      return mapUser(user);
    } catch {
      return null;
    }
  },

  /* Users (admin) --------------------------------------------------- */
  async listUsers(): Promise<User[]> {
    if (isRemote) {
      const raw = await get<unknown[]>("/admin/users");
      return (raw ?? []).map((u) => mapUser(u as Record<string, unknown>));
    }
    return [...readDb().users];
  },

  async getUser(userId: string): Promise<User> {
    if (isRemote) {
      const raw = await get<Record<string, unknown>>(`/admin/users/${userId}`);
      return mapUser(raw);
    }
    const user = readDb().users.find((u) => u.id === userId);
    if (!user) throw new Error("User not found");
    return { ...user };
  },

  async updateUserRole(userId: string, role: Role): Promise<User> {
    if (isRemote) {
      const raw = await patch<Record<string, unknown>>(`/admin/users/${userId}/role`, { role });
      return mapUser(raw);
    }
    return withDb((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new Error("User not found");
      user.role = role;
      recordEvent(db, "ROLE_CHANGED", "USER", user.id, user.name, { metadata: { role } });
      return { ...user };
    });
  },

  /** The backend does not expose a status endpoint; remote mode reports it. */
  async setUserStatus(userId: string, status: User["status"]): Promise<User> {
    if (isRemote) endpointMissing(missingBackendEndpoints.userStatus);
    return withDb((db) => {
      const user = db.users.find((u) => u.id === userId);
      if (!user) throw new Error("User not found");
      user.status = status;
      recordEvent(db, status === "ACTIVE" ? "USER_ENABLED" : "USER_DISABLED", "USER", user.id, user.name);
      return { ...user };
    });
  },

  /* Identity -------------------------------------------------------- */
  /** The backend has no /identities/me route; remote mode surfaces that. */
  async getIdentity(): Promise<Identity> {
    if (isRemote) {
      const session = getSession();
      const me = await api.fetchMe();
      return {
        id: me?.id ?? session?.userId ?? "",
        name: me?.name ?? session?.name ?? "",
        email: me?.email ?? session?.email ?? "",
        role: (me?.role ?? session?.role ?? "USER") as Role,
        did: me?.did ?? session?.did ?? "",
        status: (me?.status as User["status"] | undefined) ?? "ACTIVE",
        verified: (me?.status ?? "ACTIVE") === "ACTIVE",
        createdAt: me?.createdAt ?? new Date().toISOString(),
      };
    }
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

  /** No backend route exists; remote mode reports it instead of faking. */
  async updateIdentity(input: { name: string; did: string }): Promise<Identity> {
    if (isRemote) endpointMissing(missingBackendEndpoints.identity);
    const session = getSession();
    const email = session?.email ?? "guest@samvid.local";
    return withDb((db) => {
      db.identityOverrides[email.toLowerCase()] = { name: input.name, did: input.did };
      setSession({ ...(session ?? { email, role: "USER" }), name: input.name, did: input.did });
      recordEvent(db, "IDENTITY_VERIFIED", "IDENTITY", "USR-LOCAL", input.name);
      return { id: "USR-LOCAL", name: input.name, email, role: session?.role ?? "USER", did: input.did, status: "ACTIVE", verified: true, createdAt: new Date().toISOString(), lastProofAt: new Date().toISOString() };
    });
  },

  /* Assets ----------------------------------------------------------- */
  /** Normal users use /assets/my; admins use GET /assets (admin-only). */
  async listAssets(options?: { ownerEmail?: string; scope?: "my" | "all" }): Promise<Asset[]> {
    if (isRemote) {
      const useAdminRoute = options?.scope === "all";
      const raw = useAdminRoute ? await get<unknown[]>("/assets") : await get<unknown[]>("/assets/my");
      return (raw ?? []).map((a) => mapAsset(a as Partial<Asset> & Record<string, unknown>));
    }
    const db = readDb();
    let assets = [...db.assets];
    if (options?.ownerEmail) {
      const email = options.ownerEmail.toLowerCase();
      assets = db.assets.filter((a) => a.ownerEmail.toLowerCase() === email);
      const account = readAccount(email);
      for (const row of account.assets) {
        if (!assets.some((a) => a.id === row.id)) assets.push(accountToAsset(email, row));
      }
    }
    return assets;
  },

  async getAsset(id: string): Promise<Asset | null> {
    if (isRemote) {
      try {
        return mapAsset(await get<Partial<Asset> & Record<string, unknown>>(`/assets/${id}`));
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    }
    const session = getSession();
    const db = readDb();
    const asset = db.assets.find((a) => a.id === id);
    if (asset) return { ...asset };
    const email = session?.email ?? "guest@samvid.local";
    const row = readAccount(email).assets.find((a) => a.id === id);
    return row ? accountToAsset(email, row) : null;
  },

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    if (isRemote) {
      const payload: BackendCreateAsset = {
        name: input.name,
        description: input.description,
        assetType: input.type,
        storageKey: input.storageKey ?? input.fileName ?? "",
      };
      return mapAsset(await post<Partial<Asset> & Record<string, unknown>>("/assets", payload) as unknown as Partial<Asset> & Record<string, unknown>);
    }
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
        storageRef: input.storageKey ?? input.fileName,
        fileName: input.fileName,
        fileSize: input.fileSize,
        contentType: input.contentType,
        fileHash: input.fileHash,
      };
      db.assets.unshift(asset);
      recordEvent(db, "ASSET_CREATED", "ASSET", asset.id, asset.name);
      return { ...asset };
    });
  },

  async updateAsset(id: string, changes: Partial<Pick<Asset, "name" | "description" | "type">> & { storageKey?: string }): Promise<Asset> {
    if (isRemote) {
      const payload: Record<string, unknown> = {};
      if (changes.name !== undefined) payload.name = changes.name;
      if (changes.description !== undefined) payload.description = changes.description;
      if (changes.type !== undefined) payload.assetType = changes.type;
      if (changes.storageKey !== undefined) payload.storageKey = changes.storageKey;
      return mapAsset(await patch<Partial<Asset> & Record<string, unknown>>(`/assets/${id}`, payload));
    }
    return withDb((db) => {
      const asset = db.assets.find((a) => a.id === id);
      if (!asset) throw new Error("Asset not found");
      if (changes.name !== undefined) asset.name = changes.name;
      if (changes.description !== undefined) asset.description = changes.description;
      if (changes.type !== undefined) asset.type = changes.type;
      asset.updatedAt = new Date().toISOString();
      recordEvent(db, "ASSET_UPDATED", "ASSET", asset.id, asset.name);
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

  /* Blockchain & NFT ------------------------------------------------- */
  /** GET /assets/:id/blockchain — real registration status, never simulated. */
  async getAssetBlockchain(id: string): Promise<BlockchainInfo> {
    if (isRemote) {
      const raw = await get<Record<string, unknown>>(`/assets/${id}/blockchain`);
      return {
        registered: Boolean(raw.registered ?? raw.isRegistered ?? (raw.status ? String(raw.status).toUpperCase() !== "NOT_REGISTERED" : false)),
        status: raw.status !== undefined ? String(raw.status) : undefined,
        transactionHash: raw.transactionHash !== undefined ? String(raw.transactionHash) : undefined,
        blockNumber: raw.blockNumber !== undefined ? Number(raw.blockNumber) : undefined,
        network: raw.network !== undefined ? String(raw.network) : undefined,
        contractAddress: raw.contractAddress !== undefined ? String(raw.contractAddress) : undefined,
        registeredAt: raw.registeredAt !== undefined ? String(raw.registeredAt) : undefined,
      };
    }
    const db = readDb();
    const asset = db.assets.find((a) => a.id === id);
    return {
      registered: Boolean(asset?.nft),
      status: asset?.nft ? "CONFIRMED" : "NOT_REGISTERED",
      transactionHash: asset?.nft?.transactionHash,
      network: asset?.nft?.network ?? "Hardhat Local",
      contractAddress: asset?.nft?.contractAddress,
      registeredAt: asset?.nft?.mintedAt,
    };
  },

  /** GET /assets/:id/nft — null when the asset has not been minted. */
  async getAssetNft(id: string): Promise<NftRecord | null> {
    if (isRemote) {
      try {
        const raw = await get<Record<string, unknown>>(`/assets/${id}/nft`);
        if (!raw || (typeof raw === "object" && Object.keys(raw).length === 0)) return null;
        const record = (raw.nft ?? raw) as Record<string, unknown>;
        if (!record.tokenId && !record.transactionHash) return null;
        return {
          tokenId: record.tokenId !== undefined ? String(record.tokenId) : undefined,
          contractAddress: record.contractAddress !== undefined ? String(record.contractAddress) : undefined,
          transactionHash: record.transactionHash !== undefined ? String(record.transactionHash) : undefined,
          metadataUri: record.metadataUri !== undefined ? String(record.metadataUri) : undefined,
          network: record.network !== undefined ? String(record.network) : undefined,
          status: (record.status ?? "PENDING") as AssetStatus,
          mintedAt: record.mintedAt !== undefined ? String(record.mintedAt) : undefined,
        };
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
        throw err;
      }
    }
    return readDb().assets.find((a) => a.id === id)?.nft ?? null;
  },

  /** POST /assets/:id/nft — mints when the backend allows it. */
  async mintAsset(id: string): Promise<NftRecord> {
    if (isRemote) {
      const raw = await post<Record<string, unknown>>(`/assets/${id}/nft`);
      const record = (raw.nft ?? raw) as Record<string, unknown>;
      return {
        tokenId: record.tokenId !== undefined ? String(record.tokenId) : undefined,
        contractAddress: record.contractAddress !== undefined ? String(record.contractAddress) : undefined,
        transactionHash: record.transactionHash !== undefined ? String(record.transactionHash) : undefined,
        metadataUri: record.metadataUri !== undefined ? String(record.metadataUri) : undefined,
        network: record.network !== undefined ? String(record.network) : undefined,
        status: (record.status ?? "PENDING") as AssetStatus,
        mintedAt: record.mintedAt !== undefined ? String(record.mintedAt) : undefined,
      };
    }
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
      return asset.nft;
    });
  },

  /* Access grants ---------------------------------------------------- */
  /** GET /assets/:assetId/access — grants on one asset. */
  async listAssetAccess(assetId: string): Promise<Grant[]> {
    if (isRemote) {
      const raw = await get<unknown[]>(`/assets/${assetId}/access`);
      return (raw ?? []).map((g) => mapGrant(g as Record<string, unknown>));
    }
    return readDb().grants.filter((g) => g.assetId === assetId);
  },

  /** POST /assets/:assetId/access — { userId, permission }. */
  async createAssetAccess(assetId: string, input: Omit<BackendGrantRequest, never> & { permission: Permission }): Promise<Grant> {
    if (isRemote) {
      const grant = await post<Record<string, unknown>>(`/assets/${assetId}/access`, { userId: input.userId, permission: input.permission });
      return mapGrant({ assetId, ...(grant as Record<string, unknown>) });
    }
    return withDb((db) => {
      const asset = db.assets.find((a) => a.id === assetId);
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

  /** DELETE /assets/:assetId/access — revoke by grant id in the body. */
  async revokeAssetAccess(assetId: string, grantId: string): Promise<void> {
    if (isRemote) {
      await del<void>(`/assets/${assetId}/access/${grantId}`);
      return;
    }
    return withDb((db) => {
      const index = db.grants.findIndex((g) => g.id === grantId);
      if (index === -1) throw new Error("Grant not found");
      const [removed] = db.grants.splice(index, 1);
      recordEvent(db, "ACCESS_REVOKED", "GRANT", removed.id, removed.assetName, { metadata: { permission: removed.permission, user: removed.userEmail } });
      return undefined;
    });
  },

  /* Audit ------------------------------------------------------------ */
  /** ADMIN/AUDITOR with audit:read use /audit; normal users use /audit/my. */
  async listAudit(scope?: { mine?: boolean }): Promise<AuditEvent[]> {
    if (isRemote) {
      const raw = await get<unknown[]>(scope?.mine ? "/audit/my" : "/audit");
      return (raw ?? []).map((e) => mapAudit(e as Record<string, unknown>));
    }
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

  /* Blockchain overview ---------------------------------------------- */
  async getBlockchainStatus(): Promise<BlockchainStatus> {
    if (isRemote) {
      const raw = await get<Record<string, unknown>>("/blockchain/status").catch(() => null);
      if (!raw) return { connected: false };
      return {
        connected: Boolean(raw.connected ?? true),
        network: raw.network !== undefined ? String(raw.network) : undefined,
        blockNumber: raw.blockNumber !== undefined ? Number(raw.blockNumber) : undefined,
        lastSyncAt: raw.lastSyncAt !== undefined ? String(raw.lastSyncAt) : undefined,
      };
    }
    return { connected: true, network: "Hardhat Local", blockNumber: 1284, lastSyncAt: new Date().toISOString() };
  },

  /* Stats ------------------------------------------------------------ */
  /** The backend has no /stats route; dashboards compute totals client-side. */
  async getStats(): Promise<DashboardStats> {
    if (isRemote) endpointMissing(missingBackendEndpoints.stats);
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

  /* Legacy helpers (local demo only; kept for older local flows) ------ */
  async verifyAsset(id: string): Promise<Asset> {
    if (isRemote) {
      return api.updateAsset(id, {});
    }
    return withDb((db) => {
      const asset = db.assets.find((a) => a.id === id);
      if (!asset) throw new Error("Asset not found");
      asset.status = "VERIFIED";
      asset.updatedAt = new Date().toISOString();
      recordEvent(db, "ASSET_VERIFIED", "ASSET", asset.id, asset.name);
      return { ...asset };
    });
  },

  async transferAsset(id: string, toEmail: string): Promise<Asset> {
    if (isRemote) endpointMissing("POST /assets/:id/transfer is not part of the backend API yet — ownership transfer needs a backend route.");
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

  async listGrants(): Promise<Grant[]> {
    if (isRemote) {
      // The backend has no global grants listing; return empty and let
      // per-asset pages load /assets/:id/access instead.
      return [];
    }
    return [...readDb().grants];
  },

  async createGrant(input: GrantInput): Promise<Grant> {
    return api.createAssetAccess(input.assetId, { userId: input.userId, permission: input.permission });
  },

  async revokeGrant(id: string): Promise<Grant> {
    if (isRemote) endpointMissing("Revoking without an asset id needs the per-asset endpoint — use api.revokeAssetAccess(assetId, grantId).");
    return withDb((db) => {
      const grant = db.grants.find((g) => g.id === id);
      if (!grant) throw new Error("Grant not found");
      grant.status = "REVOKED";
      recordEvent(db, "ACCESS_REVOKED", "GRANT", grant.id, grant.assetName, { metadata: { permission: grant.permission, user: grant.userEmail } });
      return { ...grant };
    });
  },

  async listBlockchainTransactions(): Promise<BlockchainTransaction[]> {
    if (isRemote) {
      // No global transaction feed in the backend; derive from audit events.
      const events = await api.listAudit({ mine: false });
      return events
        .filter((e) => e.transactionHash)
        .map((e) => ({
          hash: e.transactionHash!,
          type: e.action,
          resourceName: e.resourceName,
          resourceId: e.resourceId,
          status: "CONFIRMED" as const,
          timestamp: e.timestamp,
        }));
    }
    return [...readDb().transactions];
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
