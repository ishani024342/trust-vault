/** Shared domain types for the Samvid frontend.
 * These mirror the backend REST contract. The API client adapts responses
 * (including snake_case from the backend) into these shapes. */

export type Role = "USER" | "MANAGER" | "ADMIN" | "AUDITOR";

export type AssetType = "DOCUMENT" | "CERTIFICATE" | "ACCESS_MANIFEST" | "CREDENTIAL" | "OTHER";

export type AssetStatus = "PENDING" | "VERIFIED" | "FAILED" | "UNAVAILABLE";

export type Permission = "READ" | "UPDATE" | "DELETE";

export type GrantStatus = "ACTIVE" | "REVOKED" | "PENDING";

export type UserStatus = "ACTIVE" | "DISABLED" | "PENDING";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  did: string;
  status: UserStatus;
  createdAt: string;
}

export interface Identity {
  id: string;
  name: string;
  email: string;
  role: Role;
  did: string;
  status: "ACTIVE" | "PENDING" | "DISABLED";
  verified: boolean;
  createdAt: string;
  lastProofAt?: string;
}

export interface NftRecord {
  tokenId?: string;
  contractAddress?: string;
  transactionHash?: string;
  metadataUri?: string;
  network?: string;
  status: AssetStatus;
  mintedAt?: string;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  description: string;
  ownerName: string;
  ownerEmail: string;
  ownerDid: string;
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
  storageRef?: string;
  metadata?: Record<string, string>;
  nft?: NftRecord;
  /** Attached document recorded for this asset, when one was uploaded. */
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  fileHash?: string;
}

export interface Grant {
  id: string;
  assetId: string;
  assetName: string;
  userId: string;
  userEmail: string;
  userName: string;
  userDid: string;
  permission: Permission;
  status: GrantStatus;
  grantedBy: string;
  grantedAt: string;
}

export type AuditAction =
  | "ASSET_CREATED"
  | "ASSET_UPDATED"
  | "ASSET_DELETED"
  | "ASSET_MINTED"
  | "ASSET_VERIFIED"
  | "ASSET_TRANSFERRED"
  | "ACCESS_GRANTED"
  | "ACCESS_REVOKED"
  | "ACCESS_UPDATED"
  | "ROLE_CHANGED"
  | "USER_DISABLED"
  | "USER_ENABLED"
  | "IDENTITY_VERIFIED"
  | "LOGIN"
  | "REGISTER";

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorName: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  metadata?: Record<string, string>;
  transactionHash?: string;
}

export interface BlockchainStatus {
  connected: boolean;
  network?: string;
  blockNumber?: number;
  lastSyncAt?: string;
}

export interface BlockchainTransaction {
  hash: string;
  type: string;
  resourceName: string;
  resourceId: string;
  status: "CONFIRMED" | "PENDING" | "FAILED";
  blockNumber?: number;
  timestamp: string;
}

export interface DashboardStats {
  totalAssets: number;
  verifiedAssets: number;
  totalGrants: number;
  totalUsers: number;
  pendingAssets: number;
  recentActivity: number;
}

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

export interface AuthResponse {
  token: string;
  user: User;
}