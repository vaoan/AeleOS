import { describe, expect, it } from "vitest";
import { cn } from "@/shared/infrastructure/cn";

describe("cn", () => {
  it("joins plain class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops every falsy value it is handed", () => {
    expect(cn("a", null, undefined, "", "c")).toBe("a c");
  });

  // The reason the above matters: a caller inlines `cond && "class"` and the
  // false branch must vanish rather than render "false". Typed as `boolean`
  // rather than written as the literal, because a literal makes the `&&` a
  // constant expression and `no-constant-binary-expression` rejects it — which
  // it should, since a constant condition tests nothing.
  it("drops a conditional class whose condition is false", () => {
    const isActive: boolean = Boolean(0);
    expect(cn("a", isActive && "b", "c")).toBe("a c");
  });

  // The whole reason tailwind-merge is here rather than clsx alone. Two
  // conflicting Tailwind utilities must resolve to the last one, or a caller
  // passing an override gets whichever the CSS happens to order later.
  it("keeps the last of two conflicting Tailwind utilities", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("keeps utilities that do not conflict", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });
});
