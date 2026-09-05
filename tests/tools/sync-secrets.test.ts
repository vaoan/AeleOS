import { describe, expect, it } from "vitest";
import {
  buildHubEnvLocal,
  parseEnvAssignments,
} from "../../scripts/sync-secrets.mjs";

describe("parseEnvAssignments", () => {
  it("parses ordinary KEY=value lines", () => {
    expect(parseEnvAssignments("A=1\nB=2\n")).toEqual({ A: "1", B: "2" });
  });

  it("returns an empty object for empty text", () => {
    expect(parseEnvAssignments("")).toEqual({});
  });

  it("skips comment and blank lines", () => {
    expect(parseEnvAssignments("# comment\n\nA=1\n")).toEqual({ A: "1" });
  });

  it("skips a line with no '='", () => {
    expect(parseEnvAssignments("not-an-assignment\nA=1\n")).toEqual({
      A: "1",
    });
  });

  // Splits on the FIRST '=' only — a base64 value's own padding must survive.
  it("keeps '=' characters inside the value", () => {
    expect(parseEnvAssignments("KEY=abc==\n")).toEqual({ KEY: "abc==" });
  });

  it("lets a later duplicate key win", () => {
    expect(parseEnvAssignments("A=1\nA=2\n")).toEqual({ A: "2" });
  });
});

describe("buildHubEnvLocal", () => {
  const example = [
    "# header comment",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx",
    "CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx",
    "",
    "NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-SUPABASE_PUBLISHABLE_KEY-from-.secrets",
    "",
    "AELEOS_ALLOWED_RETURN_ORIGINS=http://localhost:5000",
    "NEXT_PUBLIC_HUB_HOST=localhost",
    "",
  ].join("\n");

  const secrets = {
    CLERK_PUBLISHABLE_KEY: "pk_test_real",
    CLERK_SECRET_KEY: "sk_test_real",
    SUPABASE_URL: "https://real.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_real",
  };

  it("substitutes all four mapped keys", () => {
    const result = buildHubEnvLocal(example, secrets);
    expect(result).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_real");
    expect(result).toContain("CLERK_SECRET_KEY=sk_test_real");
    expect(result).toContain(
      "NEXT_PUBLIC_SUPABASE_URL=https://real.supabase.co",
    );
    expect(result).toContain(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_real",
    );
  });

  it("leaves every comment, blank line and unmapped key untouched", () => {
    const result = buildHubEnvLocal(example, secrets);
    expect(result).toContain("# header comment");
    expect(result).toContain(
      "AELEOS_ALLOWED_RETURN_ORIGINS=http://localhost:5000",
    );
    expect(result).toContain("NEXT_PUBLIC_HUB_HOST=localhost");
  });

  // A partial `.secrets` must not blank a line it cannot fill — the reader
  // needs to see what is still missing.
  it("leaves a mapped key's placeholder alone when secrets lacks it", () => {
    const result = buildHubEnvLocal(example, { CLERK_PUBLISHABLE_KEY: "pk_x" });
    expect(result).toContain(
      "CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx",
    );
    expect(result).toContain(
      "NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co",
    );
  });

  it("produces the same line count as the example (no line dropped or added)", () => {
    const result = buildHubEnvLocal(example, secrets);
    expect(result.split("\n").length).toBe(example.split("\n").length);
  });
});
