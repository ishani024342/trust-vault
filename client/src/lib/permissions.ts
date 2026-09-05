import type { Role } from "./types";

/** Capability map. The backend remains the source of truth; this only drives
 * which actions are rendered for the signed-in role. */

export const PERMISSIONS = {
  USER: {
    viewDashboard: true,
    viewOwnIdentity: true,
    viewAssets: true,
    createAsset: true,
    editAsset: true,
    deleteAsset: true,
    mintAsset: true,
    verifyAsset: true,
    transferAsset: true,
    grantAccess: true,
    viewAudit: true,
    viewBlockchain: true,
    viewUsers: false,
    manageUsers: false,
    manageRoles: false,
    manageGrants: true,
  },
  MANAGER: {
    viewDashboard: true,
    viewOwnIdentity: true,
    viewAssets: true,
    createAsset: true,
    editAsset: true,
    deleteAsset: false,
    mintAsset: true,
    verifyAsset: true,
    transferAsset: true,
    grantAccess: true,
    viewAudit: true,
    viewBlockchain: true,
    viewUsers: true,
    manageUsers: false,
    manageRoles: false,
    manageGrants: true,
  },
  ADMIN: {
    viewDashboard: true,
    viewOwnIdentity: true,
    viewAssets: true,
    createAsset: true,
    editAsset: true,
    deleteAsset: true,
    mintAsset: true,
    verifyAsset: true,
    transferAsset: true,
    grantAccess: true,
    viewAudit: true,
    viewBlockchain: true,
    viewUsers: true,
    manageUsers: true,
    manageRoles: true,
    manageGrants: true,
  },
  AUDITOR: {
    viewDashboard: true,
    viewOwnIdentity: true,
    viewAssets: true,
    createAsset: false,
    editAsset: false,
    deleteAsset: false,
    mintAsset: false,
    verifyAsset: true,
    transferAsset: false,
    grantAccess: false,
    viewAudit: true,
    viewBlockchain: true,
    viewUsers: true,
    manageUsers: false,
    manageRoles: false,
    manageGrants: false,
  },
} as const;

export type Capability = keyof (typeof PERMISSIONS)["USER"];

export function can(role: Role, capability: Capability): boolean {
  return PERMISSIONS[role]?.[capability] ?? false;
}

export const ROLE_ORDER: Role[] = ["USER", "MANAGER", "AUDITOR", "ADMIN"];

export function roleLabel(role: Role): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}