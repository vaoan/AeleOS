import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findTrust,
  mintSessionToken,
  readSecret,
  withTestUser,
} from "../../scripts/run-cloud-idp.mjs";

/**
 * A `fetch` that answers from a script of `[urlSubstring, response]` pairs, in
 * order, and records every call. A URL with no entry is a test bug, so it
 * throws rather than answering something plausible.
 */
function scriptedFetch(
  script: Array<
    [
      string,
      {
        status?: number;
        body?: unknown;
        headers?: Record<string, string>;
      },
    ]
  >,
) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = script.shift();
    if (!next || !url.includes(next[0])) {
      throw new Error(`unscripted fetch: ${url} (expected ${next?.[0]})`);
    }
    const { status = 200, body = {}, headers = {} } = next[1];
    return new Response(JSON.stringify(body), { status, headers });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readSecret", () => {
  it("reads the value after the first '=' and trims it", () => {
    expect(
      readSecret("A=1\nCLERK_SECRET_KEY= sk_test_x \n", "CLERK_SECRET_KEY"),
    ).toBe("sk_test_x");
  });

  it("is null for an absent key", () => {
    expect(readSecret("A=1\n", "B")).toBeNull();
  });

  // The production keys sit beside the development ones under longer names.
  it("does not let a longer key answer for a shorter one", () => {
    expect(
      readSecret("CLERK_PROD_SECRET_KEY=sk_live_x\n", "CLERK_SECRET_KEY"),
    ).toBeNull();
  });
});

describe("findTrust", () => {
  const production = {
    type: "custom",
    oidc_issuer_url: "https://clerk.furrycolombia.com/",
  };
  const development = {
    type: "clerk-development",
    oidc_issuer_url: "https://puma.clerk.accounts.dev",
  };
  const providers = [production, development];

  it("matches the entry whose issuer is the domain in use, whatever its type", () => {
    expect(findTrust(providers, "clerk.furrycolombia.com")).toBe(production);
  });

  it("falls back to the first Clerk-typed entry when no domain is given", () => {
    expect(findTrust(providers, null)).toBe(development);
  });

  it("is undefined when nothing trusts the domain", () => {
    expect(findTrust(providers, "clerk.example.com")).toBeUndefined();
  });

  it("is undefined when no entry is Clerk-typed and no domain is given", () => {
    expect(findTrust([production], null)).toBeUndefined();
  });
});

describe("mintSessionToken", () => {
  it("on a development key creates the session through the Backend API", async () => {
    const calls = scriptedFetch([
      ["/v1/sessions", { body: { id: "session_1" } }],
      ["/v1/sessions/session_1/tokens", { body: { jwt: "dev.jwt" } }],
    ]);
    await expect(
      mintSessionToken("sk_test_k", "puma.clerk.accounts.dev", "user_1"),
    ).resolves.toBe("dev.jwt");
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.clerk.com/v1/sessions",
      "https://api.clerk.com/v1/sessions/session_1/tokens",
    ]);
  });

  it("on a production key goes through a sign-in token and the Frontend API's native mode", async () => {
    const calls = scriptedFetch([
      ["/v1/sign_in_tokens", { body: { token: "ticket_1" } }],
      [
        "https://clerk.example.com/v1/client/sign_ins?_is_native=1",
        {
          body: { response: { created_session_id: "session_p" } },
          headers: { authorization: "client_jwt" },
        },
      ],
      [
        "https://clerk.example.com/v1/client/sessions/session_p/tokens?_is_native=1",
        { body: { jwt: "prod.jwt" } },
      ],
    ]);
    await expect(
      mintSessionToken("sk_live_k", "clerk.example.com", "user_1"),
    ).resolves.toBe("prod.jwt");
    // The ticket is consumed as a form post, and the client token travels
    // back in the Authorization header for the token request.
    expect(String(calls[1]?.init?.body)).toContain("strategy=ticket");
    expect(String(calls[1]?.init?.body)).toContain("ticket=ticket_1");
    expect(
      (calls[2]?.init?.headers as Record<string, string>).Authorization,
    ).toBe("client_jwt");
  });

  it("refuses production without a domain before making any request", async () => {
    const calls = scriptedFetch([]);
    await expect(mintSessionToken("sk_live_k", null, "user_1")).rejects.toThrow(
      /CLERK_DOMAIN is required/,
    );
    expect(calls).toHaveLength(0);
  });

  it("throws, never exits, when the Backend API refuses", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);
    scriptedFetch([
      [
        "/v1/sessions",
        {
          status: 400,
          body: {
            errors: [
              { message: "Request only valid for development instances." },
            ],
          },
        },
      ],
    ]);
    await expect(mintSessionToken("sk_test_k", null, "user_1")).rejects.toThrow(
      /only valid for development/,
    );
    expect(exit).not.toHaveBeenCalled();
  });

  it("throws when the sign-in answers without a client token", async () => {
    scriptedFetch([
      ["/v1/sign_in_tokens", { body: { token: "ticket_1" } }],
      [
        "/client/sign_ins",
        { status: 200, body: { response: { created_session_id: "s" } } },
      ],
    ]);
    await expect(
      mintSessionToken("sk_live_k", "clerk.example.com", "user_1"),
    ).rejects.toThrow(/client\/sign_ins -> HTTP 200/);
  });

  it("throws when the sign-in completes without a session", async () => {
    scriptedFetch([
      ["/v1/sign_in_tokens", { body: { token: "ticket_1" } }],
      [
        "/client/sign_ins",
        { body: { response: {} }, headers: { authorization: "c" } },
      ],
    ]);
    await expect(
      mintSessionToken("sk_live_k", "clerk.example.com", "user_1"),
    ).rejects.toThrow(/without creating a session/);
  });

  it("throws when the session token request fails", async () => {
    scriptedFetch([
      ["/v1/sign_in_tokens", { body: { token: "ticket_1" } }],
      [
        "/client/sign_ins",
        {
          body: { response: { created_session_id: "s" } },
          headers: { authorization: "c" },
        },
      ],
      ["/client/sessions/s/tokens", { status: 401, body: {} }],
    ]);
    await expect(
      mintSessionToken("sk_live_k", "clerk.example.com", "user_1"),
    ).rejects.toThrow(/tokens -> HTTP 401/);
  });
});

describe("withTestUser", () => {
  const created = ["/v1/users", { body: { id: "user_t" } }] as const;
  const deleted = ["/v1/users/user_t", { status: 200 }] as const;

  it("creates the user, runs the body, deletes the user, and returns the body's status", async () => {
    const calls = scriptedFetch([[...created], [...deleted]]);
    const body = vi.fn(async () => 0);
    await expect(
      withTestUser("sk_test_k", "p@example.com", body),
    ).resolves.toBe(0);
    expect(body).toHaveBeenCalledWith({ id: "user_t" });
    expect(calls.at(-1)?.url).toBe("https://api.clerk.com/v1/users/user_t");
    expect(calls.at(-1)?.init?.method).toBe("DELETE");
  });

  // The regression: a mint that fails must not leave the user behind.
  it("deletes the user and reports status 1 when the body throws", async () => {
    const calls = scriptedFetch([[...created], [...deleted]]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = await withTestUser(
      "sk_live_k",
      "p@example.com",
      async () => {
        throw new Error(
          "/sessions -> HTTP 400: Request only valid for development instances.",
        );
      },
    );
    expect(status).toBe(1);
    expect(calls.at(-1)?.init?.method).toBe("DELETE");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("only valid for development instances"),
    );
  });

  it("keeps the body's status when the delete fails, and says so", async () => {
    scriptedFetch([[...created], ["/v1/users/user_t", { status: 500 }]]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      withTestUser("sk_test_k", "p@example.com", async () => 0),
    ).resolves.toBe(0);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("could not delete user_t"),
    );
  });

  it("propagates a failed creation, since nothing is owned yet", async () => {
    scriptedFetch([
      [
        "/v1/users",
        { status: 422, body: { errors: [{ message: "bad email" }] } },
      ],
    ]);
    await expect(
      withTestUser("sk_test_k", "p@example.com", async () => 0),
    ).rejects.toThrow(/users -> HTTP 422: bad email/);
  });
});
