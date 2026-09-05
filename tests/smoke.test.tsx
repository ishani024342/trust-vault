/* Render smoke test: mounts the real App at every route with the WebGL scene
 * stubbed out, so a component crash (hooks order, missing module, bad data
 * access) fails the test instead of producing a blank page in the preview. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => {
  const React = require("react") as typeof import("react");
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) => React.createElement("div", { "data-testid": "mock-canvas" }, children),
    Null: () => null,
  };
});

vi.mock("@react-three/fiber", () => ({
  Canvas: h.Canvas,
  useFrame: () => {},
}));

vi.mock("@react-three/drei", () => ({
  ContactShadows: h.Null,
  Environment: ({ children }: { children?: unknown }) => children,
  Lightformer: h.Null,
  Html: h.Null,
}));

vi.mock("@/components/robot-hero", () => ({
  Robot: h.Null,
}));

import App from "@/App";

const routes: Array<[string, string]> = [
  ["/", "Identity."],
  ["/dashboard", "My Identity"],
  ["/console/user", "Your assets, your authority."],
  ["/console/user/assets", "Owned resources."],
  ["/console/user/access", "Permissions on your records."],
  ["/console/user/audit", "Your proof path."],
  ["/console/user/identity/edit", "Edit your identity."],
  ["/console/user/assets/AST-0001", "ASSET RECORD"],
  ["/console/manager", "The access layer, governed."],
  ["/console/manager/access", "Permission registry."],
  ["/console/manager/assets", "Asset registry."],
  ["/console/manager/audit", "System consequences."],
  ["/console/admin", "The trust layer, governed."],
  ["/console/admin/users", "People and roles."],
  ["/console/admin/roles", "Permission boundaries."],
  ["/console/admin/assets", "Every owned resource."],
  ["/console/admin/audit", "System consequences."],
  ["/console/auditor", "Every action leaves evidence."],
  ["/console/auditor/assets", "Proof status, inspected."],
  ["/console/auditor/audit", "Every action leaves evidence."],
  ["/console/auditor/blockchain", "Chain state, readable."],
  ["/nonexistent", "No proof"],
];

describe("Samvid app routes", () => {
  const roots: Root[] = [];

  beforeEach(() => {
    document.body.innerHTML = "<div id='root'></div>";
    localStorage.clear();
    roots.length = 0;
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    document.body.innerHTML = "";
  });

  function renderPath(path: string) {
    window.history.replaceState({}, "", path);
    const el = document.getElementById("root")!;
    const root = createRoot(el);
    roots.push(root);
    act(() => {
      root.render(<App />);
    });
    return el;
  }

  it.each(routes)("renders %s without crashing", (path, expected) => {
    const el = renderPath(path);
    expect(el.textContent).toContain(expected);
  });

  it("keeps the landing hero proof field present", () => {
    const el = renderPath("/");
    expect(el.querySelector(".hero-section")).not.toBeNull();
    expect(el.querySelector(".identity-scene-wrap")).not.toBeNull();
    expect(el.querySelector(".topbar")).not.toBeNull();
  });
});