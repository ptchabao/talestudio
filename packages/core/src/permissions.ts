/** Workspace roles, from least to most privileged. */
export const ROLES = ["viewer", "editor", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

const MIN_ROLE = {
  "project:read": "viewer",
  "project:create": "editor",
  "production:create": "editor",
  "production:approve": "editor",
  "production:edit": "editor",
  "production:cancel": "editor",
  "character:edit": "editor",
  "billing:read": "admin",
  "billing:manage": "admin",
  "members:manage": "admin",
  "workspace:delete": "owner",
} as const satisfies Record<string, Role>;
export type Permission = keyof typeof MIN_ROLE;

export const can = (role: Role, permission: Permission) => ROLES.indexOf(role) >= ROLES.indexOf(MIN_ROLE[permission]);

/** Admins can grant up to their own level; only owners can make owners. */
export const assignableRoles = (role: Role): Role[] => ROLES.filter((r) => ROLES.indexOf(r) <= ROLES.indexOf(role));
