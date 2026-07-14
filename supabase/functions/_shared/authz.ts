import { PlatformError } from "./errors.ts";

export type PlatformRole =
  | "member"
  | "churchAdmin"
  | "platformAdmin"
  | "superAdmin";

export type AuthorizationUser = {
  role?: unknown;
  churchId?: unknown;
  primaryOrgId?: unknown;
  isDeleted?: unknown;
};

export const normalizeRole = (role: unknown): PlatformRole => {
  if (
    role === "churchAdmin" || role === "platformAdmin" || role === "superAdmin"
  ) return role;
  return "member";
};

export const requireActiveUser = <T extends AuthorizationUser>(
  user: T | null,
): T => {
  if (!user || user.isDeleted === true) throw new PlatformError("FORBIDDEN");
  return user;
};

export const requireRole = (
  user: AuthorizationUser | null,
  allowed: readonly PlatformRole[],
): PlatformRole => {
  const activeUser = requireActiveUser(user);
  const role = normalizeRole(activeUser.role);
  if (!allowed.includes(role)) throw new PlatformError("FORBIDDEN");
  return role;
};

export const isPlatformRole = (role: unknown): boolean =>
  role === "platformAdmin" || role === "superAdmin";

export const requireOrganizationAdmin = (
  user: AuthorizationUser | null,
  organizationId: string,
): void => {
  const activeUser = requireActiveUser(user);
  if (isPlatformRole(activeUser.role)) return;
  const ownOrganizationId = typeof activeUser.churchId === "string"
    ? activeUser.churchId
    : typeof activeUser.primaryOrgId === "string"
    ? activeUser.primaryOrgId
    : null;
  if (
    normalizeRole(activeUser.role) !== "churchAdmin" || !organizationId ||
    ownOrganizationId !== organizationId
  ) {
    throw new PlatformError("FORBIDDEN");
  }
};
