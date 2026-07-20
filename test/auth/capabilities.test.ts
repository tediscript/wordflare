import { describe, expect, it } from "vitest";
import { can, roleCapabilities, type Capability } from "../../src/auth/capabilities";

describe("roles & capabilities", () => {
  it("administrator holds the iteration-1 capabilities", () => {
    expect(roleCapabilities.administrator).toContain("edit_posts");
    expect(roleCapabilities.administrator).toContain("publish_posts");
  });

  it("grants declared capabilities to administrator", () => {
    expect(can("administrator", "edit_posts")).toBe(true);
    expect(can("administrator", "publish_posts")).toBe(true);
  });

  it("denies an undeclared capability even when the type is bypassed", () => {
    // Fail-closed at runtime: a capability not in the role's list is denied.
    expect(can("administrator", "delete_site" as Capability)).toBe(false);
  });

  it("fails closed for an unknown role", () => {
    expect(can("editor", "edit_posts")).toBe(false);
    expect(can("", "edit_posts")).toBe(false);
  });
});
