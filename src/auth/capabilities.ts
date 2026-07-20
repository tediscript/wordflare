/**
 * Roles & Capabilities — the authorization model (CONTEXT.md).
 *
 * Iteration 1 ships a single Role (**Administrator**) holding every Capability,
 * but the model is built so more roles/users can be added later: each admin
 * action checks a specific Capability via {@link can}, and capabilities are
 * declared per role in {@link roleCapabilities}. Unknown roles and unknown
 * capabilities both **fail closed** (no capability granted) — never silently
 * allow an undeclared permission.
 */

/** A named bundle of capabilities assigned to a user (iteration 1: Administrator). */
export type Role = "administrator";

/**
 * A specific permission, checked per action. Grow this union as actions land;
 * every admin action should gate on one of these rather than on a role name.
 */
export type Capability = "edit_posts" | "publish_posts";

/** Capabilities granted to each role. Administrator can do everything in iter 1. */
export const roleCapabilities: Record<Role, Capability[]> = {
  administrator: ["edit_posts", "publish_posts"],
};

/**
 * Does `role` hold `capability`? Unknown roles fail closed. (Unknown
 * capabilities are prevented at compile time by the `Capability` union; if a
 * caller bypasses the type, the lookup still yields `false`.)
 */
export function can(role: string, capability: Capability): boolean {
  if (role !== "administrator") return false;
  return roleCapabilities.administrator.includes(capability);
}
