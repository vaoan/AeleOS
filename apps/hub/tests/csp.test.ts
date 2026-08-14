import { describe, expect, it } from "vitest";
import {
  clerkHostFromPublishableKey,
  contentSecurityPolicy,
  securityHeaders,
} from "@/shared/domain/csp";
import { PLAYER_ORIGINS } from "@/features/actors/domain/embeds";

/**
 * The values of one directive.
 *
 * @param policy - the whole header.
 * @param name - the directive.
 * @returns its values, or an empty array when it is absent.
 */
function directive(policy: string, name: string): string[] {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  return found ? found.split(" ").slice(1) : [];
}

const HOSTS = {
  clerk: "https://regular-puma-47.clerk.accounts.dev",
  supabase: "https://example.supabase.co",
};

describe("clerkHostFromPublishableKey", () => {
  // The key encodes the host, so reading it from there means the policy cannot
  // name a different Clerk than the app talks to — which would block sign-in.
  it("reads the host out of a test key", () => {
    const key = `pk_test_${Buffer.from("regular-puma-47.clerk.accounts.dev$").toString("base64")}`;
    expect(clerkHostFromPublishableKey(key)).toBe(
      "https://regular-puma-47.clerk.accounts.dev",
    );
  });

  it("reads the host out of a live key", () => {
    const key = `pk_live_${Buffer.from("clerk.furrycolombia.com$").toString("base64")}`;
    expect(clerkHostFromPublishableKey(key)).toBe(
      "https://clerk.furrycolombia.com",
    );
  });

  // Null rather than a throw: this runs while the config is being built, and a
  // malformed key has to surface as a missing host somebody can report.
  it.each([
    undefined,
    "",
    "not-a-key",
    "pk_test_",
    `pk_test_${Buffer.from("not a hostname$").toString("base64")}`,
    "pk_test_!!!!not-base64!!!!",
  ])("returns null for %o", (key) => {
    expect(clerkHostFromPublishableKey(key)).toBeNull();
  });
});

describe("contentSecurityPolicy", () => {
  const policy = contentSecurityPolicy(HOSTS);

  // The second layer under the media layouts. resolveEmbed already refuses to
  // build any other address; this refuses to load one even if it did.
  it("frames only the players the resolver can produce", () => {
    const framed = directive(policy, "frame-src");
    for (const origin of PLAYER_ORIGINS) expect(framed).toContain(origin);
  });

  // The single most likely thing to be forgotten when this is edited, and the
  // hardest failure to diagnose: the sign-in form renders and the challenge is
  // an empty box.
  it("frames Cloudflare Turnstile, which Clerk needs to sign anybody in", () => {
    expect(directive(policy, "frame-src")).toContain(
      "https://challenges.cloudflare.com",
    );
  });

  it("lets the app reach Clerk and Supabase", () => {
    const connect = directive(policy, "connect-src");
    expect(connect).toContain(HOSTS.clerk);
    expect(connect).toContain(HOSTS.supabase);
  });

  // Realtime is a websocket to the same host, and `https:` does not cover it.
  it("lets the app reach Supabase over a websocket", () => {
    expect(directive(policy, "connect-src")).toContain(
      "wss://example.supabase.co",
    );
  });

  it("lets Clerk's own script load", () => {
    expect(directive(policy, "script-src")).toContain(HOSTS.clerk);
  });

  describe("the directives that actually protect something", () => {
    it.each([
      ["object-src", "'none'"],
      ["frame-ancestors", "'none'"],
      ["base-uri", "'self'"],
      ["form-action", "'self'"],
    ])("sets %s to %s", (name, value) => {
      expect(directive(policy, name)).toEqual([value]);
    });
  });

  // Every picture is an address somebody pasted at a host that was never ours,
  // so an allowlist here would be a list of the whole internet or a feature
  // that does not work. Stated as a test so it reads as a decision.
  it("allows a picture from any https host, deliberately", () => {
    expect(directive(policy, "img-src")).toContain("https:");
  });

  // A missing host is omitted rather than widened. A policy without the Clerk
  // origin fails loudly at sign-in, which is findable; one that quietly allowed
  // everything would not fail at all.
  it("omits a host it does not have rather than allowing everything", () => {
    const partial = contentSecurityPolicy({ clerk: null, supabase: null });
    expect(directive(partial, "connect-src")).not.toContain("*");
    expect(directive(partial, "connect-src")).toContain("'self'");
    expect(directive(partial, "script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
    ]);
  });

  it("still frames the players when no host is configured", () => {
    const partial = contentSecurityPolicy({ clerk: null, supabase: null });
    for (const origin of PLAYER_ORIGINS) {
      expect(directive(partial, "frame-src")).toContain(origin);
    }
  });

  it("upgrades insecure requests", () => {
    expect(policy).toContain("upgrade-insecure-requests");
  });

  // A header with a newline in it is rejected outright by some servers and
  // silently truncated by others.
  it("is one line", () => {
    expect(policy).not.toMatch(/[\r\n]/);
  });
});

describe("securityHeaders", () => {
  /**
   * Runs a check with the environment the headers read from.
   *
   * Restores whatever was there, because vitest shares one process across a
   * file and a leaked variable would make a later test pass for the wrong
   * reason.
   *
   * @param env - the variables to set for the call.
   * @returns the headers.
   */
  function withEnv(env: Record<string, string | undefined>) {
    const before = { ...process.env };
    Object.assign(process.env, env);
    try {
      return securityHeaders();
    } finally {
      process.env = before;
    }
  }

  it("names the Clerk and Supabase hosts the deployment actually uses", () => {
    const headers = withEnv({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("regular-puma-47.clerk.accounts.dev$").toString("base64")}`,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    });
    const csp = headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("https://regular-puma-47.clerk.accounts.dev");
    expect(csp).toContain("https://example.supabase.co");
  });

  // A deployment with nothing configured must still emit a policy. Returning
  // none would silently drop the frame allowlist too, which is the part that
  // does not depend on any environment variable at all.
  it("still emits a policy when nothing is configured", () => {
    const headers = withEnv({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_URL: undefined,
    });
    const csp = headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://www.youtube-nocookie.com");
  });

  it("carries the two headers that pair with the policy", () => {
    const keys = withEnv({}).map((h) => h.key);
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("X-Content-Type-Options");
  });
});
