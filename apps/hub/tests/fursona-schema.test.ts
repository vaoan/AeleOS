import { assert, describe, expect, it } from "vitest";
import {
  VISIBILITIES,
  parseFursona,
} from "@/features/actors/domain/fursona-schema";

/**
 * A valid input with the given overrides applied.
 *
 * @param over - fields to replace.
 * @returns the raw object to parse.
 */
const input = (over: Record<string, unknown> = {}) => ({
  handle: "sparky",
  displayName: "Sparky",
  avatarUrl: "",
  visibility: "private",
  ...over,
});

describe("parseFursona", () => {
  it("accepts a valid fursona", () => {
    const result = parseFursona(input());
    expect(result.ok).toBe(true);
  });

  it("trims the handle rather than rejecting padded input", () => {
    const result = parseFursona(input({ handle: "  sparky  " }));
    expect(result.ok && result.value.handle).toBe("sparky");
  });

  it("rejects a blank handle", () => {
    const result = parseFursona(input({ handle: "   " }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.handle).toBeDefined();
  });

  it("rejects a handle that is too long", () => {
    const result = parseFursona(input({ handle: "a".repeat(33) }));
    expect(result.ok).toBe(false);
  });

  // The handle appears in URLs and is compared case-insensitively by the
  // database's unique index. Allowing punctuation would make two visually
  // identical handles route differently.
  it("rejects a handle with characters that are not letters, digits, dash or underscore", () => {
    for (const bad of ["spar ky", "spar/ky", "spar.ky", "spar@ky"]) {
      expect(parseFursona(input({ handle: bad })).ok).toBe(false);
    }
  });

  it("accepts an empty avatar url as absent", () => {
    const result = parseFursona(input({ avatarUrl: "" }));
    expect(result.ok && result.value.avatarUrl).toBe("");
  });

  // An avatar_url is rendered into an <img src>. A javascript: or data: URL
  // there is a script-execution vector, so the allowed schemes are named
  // rather than inferred.
  it("rejects an avatar url that is not http or https", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "not a url",
    ]) {
      expect(parseFursona(input({ avatarUrl: bad })).ok).toBe(false);
    }
  });

  it("accepts an https avatar url", () => {
    const result = parseFursona(
      input({ avatarUrl: "https://img.example/a.png" }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a visibility outside the allowed set", () => {
    expect(parseFursona(input({ visibility: "everyone" })).ok).toBe(false);
  });

  it("accepts every visibility the database allows", () => {
    for (const v of VISIBILITIES) {
      expect(parseFursona(input({ visibility: v })).ok).toBe(true);
    }
  });

  it("reports errors keyed by field so a form can render them inline", () => {
    const result = parseFursona(input({ handle: "", visibility: "nope" }));
    // `assert` rather than `if`, because the guard here was for the COMPILER —
    // `expect` does not narrow a discriminated union, so the errors below were
    // unreachable to TypeScript without it. An `if` narrows and also makes the
    // assertion skippable; this narrows and fails instead.
    assert(!result.ok, "two invalid fields must not parse");
    expect(Object.keys(result.errors).sort()).toEqual(["handle", "visibility"]);
  });

  it("rejects a non-object input rather than throwing", () => {
    expect(parseFursona(null).ok).toBe(false);
    expect(parseFursona("nope").ok).toBe(false);
  });
});
