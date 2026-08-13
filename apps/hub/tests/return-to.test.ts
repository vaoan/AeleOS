import { describe, expect, it } from "vitest";
import {
  declineUrl,
  isAllowedReturnTo,
} from "@/features/picker/domain/return-to";
// From its own module, not through the picker: the picker deliberately does
// not re-export this guard, because the two are not substitutes and the wrong
// import is not a compile error. See the note in `features/picker/index.ts`.
import { isInternalPath } from "@/shared/domain/return-to";

const ALLOWED = [
  "https://puck.furrycolombia.com",
  "http://localhost:5000",
] as const;

/**
 * Whether the candidate is allowed against the fixture origins.
 *
 * @param candidate - the URL to check.
 * @returns the guard's answer.
 */
const ok = (candidate: string) => isAllowedReturnTo(candidate, ALLOWED);

describe("isAllowedReturnTo", () => {
  it("accepts an exact allowed origin", () => {
    expect(ok("https://puck.furrycolombia.com/callback")).toBe(true);
    expect(ok("http://localhost:5000/x?y=1")).toBe(true);
  });

  it("rejects a different host", () => {
    expect(ok("https://evil.example/callback")).toBe(false);
  });

  // The three shapes that beat naive matching. A subdomain beats "endsWith",
  // a suffixed host beats "startsWith", and a scheme swap beats host-only
  // comparison — which is why this compares the parsed origin as a whole.
  it("rejects a subdomain of an allowed origin", () => {
    expect(ok("https://evil.puck.furrycolombia.com/x")).toBe(false);
  });

  it("rejects a host that merely starts with an allowed one", () => {
    expect(ok("https://puck.furrycolombia.com.evil.example/x")).toBe(false);
  });

  it("rejects an allowed host under a different scheme", () => {
    expect(ok("http://puck.furrycolombia.com/callback")).toBe(false);
  });

  it("rejects an allowed host on a different port", () => {
    expect(ok("http://localhost:5001/x")).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(ok("javascript:alert(1)")).toBe(false);
    expect(ok("data:text/html,<script>")).toBe(false);
  });

  it("rejects a protocol-relative URL", () => {
    expect(ok("//evil.example/x")).toBe(false);
  });

  it("rejects garbage rather than throwing", () => {
    expect(ok("not a url")).toBe(false);
    expect(ok("")).toBe(false);
  });

  it("rejects everything when the allowlist is empty", () => {
    expect(isAllowedReturnTo("https://puck.furrycolombia.com/x", [])).toBe(
      false,
    );
  });

  // Credentials in a URL are a phishing shape: the browser shows the userinfo
  // before the @, so an allowed origin can be made to appear in a bar that
  // navigates elsewhere. URL parsing puts them outside `origin`, so this is
  // about refusing to hand one back, not about matching.
  it("rejects a URL carrying credentials", () => {
    expect(ok("https://puck.furrycolombia.com@evil.example/x")).toBe(false);
    expect(ok("https://user:pw@puck.furrycolombia.com/x")).toBe(false);
  });

  // The WHATWG parser strips tab, LF and CR before comparing origins, so an
  // allowed-looking candidate can still carry one of these in the raw string
  // a caller goes on to use. Node refuses to put such a string in a redirect
  // header (`ERR_INVALID_CHAR`), turning an "allowed" answer into a crash —
  // so these are refused outright, before parsing.
  it("rejects a URL carrying a raw tab, LF or CR", () => {
    expect(ok("https://puck.furrycolombia.com/x\tSet-Cookie: a=b")).toBe(false);
    expect(ok("https://puck.furrycolombia.com/x\r\nSet-Cookie: a=b")).toBe(
      false,
    );
    expect(ok("https://puck.furrycolombia.com/x\nSet-Cookie: a=b")).toBe(false);
  });
});

describe("isInternalPath", () => {
  it("accepts a rooted path", () => {
    expect(isInternalPath("/es/picker?return_to=x")).toBe(true);
    expect(isInternalPath("/")).toBe(true);
  });

  // Every one of these is an open redirect if it reaches a `redirect()`.
  it("rejects anything that could leave this origin", () => {
    for (const bad of [
      "https://evil.example/x",
      "//evil.example/x",
      "/\\evil.example/x",
      "\\\\evil.example\\x",
      "javascript:alert(1)",
      "http://localhost:5000/x",
    ]) {
      expect(isInternalPath(bad)).toBe(false);
    }
  });

  // The WHATWG parser removes ASCII tab, LF and CR from anywhere in the
  // input before parsing — so a string-shape check that reads every
  // character the candidate *contains* still misses these: none of them
  // starts with "//" or "/\", yet each resolves off-origin once parsed.
  // "/\t/evil.example" is the exploit: %09 decodes to a tab, and
  // "…/sign-in?redirect_url=/%09/evil.example" would have passed the old
  // startsWith-only guard.
  it("rejects a path that resolves off-origin only once the parser strips a stripped character", () => {
    for (const bad of [
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "/\t\\evil.example",
      "///evil.example",
    ]) {
      expect(isInternalPath(bad)).toBe(false);
    }
  });

  it("rejects a relative path with no leading slash", () => {
    expect(isInternalPath("picker")).toBe(false);
    expect(isInternalPath("")).toBe(false);
  });

  // A malformed authority (an unterminated IPv6 literal) makes the parse
  // itself throw, rather than merely resolving off-origin.
  it("rejects a candidate that fails to parse rather than throwing", () => {
    expect(isInternalPath("//[::1")).toBe(false);
  });
});

describe("declineUrl", () => {
  it("returns the destination unchanged when there is nothing to strip", () => {
    expect(declineUrl("https://puck.furrycolombia.com/back")).toBe(
      "https://puck.furrycolombia.com/back",
    );
  });

  // The whole reason this is a function rather than the raw string. A caller
  // controls `return_to`, so it may already carry an actor_ref — and handing
  // that back would report a choice from somebody who explicitly declined to
  // make one.
  it("strips an actor_ref the caller planted on the destination", () => {
    const url = new URL(
      declineUrl("https://puck.furrycolombia.com/back?actor_ref=not-mine"),
    );

    expect(url.searchParams.has("actor_ref")).toBe(false);
  });

  it("strips every actor_ref when the key repeats", () => {
    const url = new URL(
      declineUrl("https://puck.furrycolombia.com/b?actor_ref=a&actor_ref=b"),
    );

    expect(url.searchParams.getAll("actor_ref")).toEqual([]);
  });

  // Declining is not a licence to discard the caller's own state: their query
  // and fragment are part of where they asked to be returned to.
  it("keeps the caller's other query parameters and its fragment", () => {
    const url = new URL(
      declineUrl(
        "https://puck.furrycolombia.com/back?flow=abc&actor_ref=x#section",
      ),
    );

    expect(url.searchParams.get("flow")).toBe("abc");
    expect(url.hash).toBe("#section");
    expect(url.searchParams.has("actor_ref")).toBe(false);
  });

  // Normalised rather than echoed: what lands in the href is what a parser
  // agrees the destination is, not whatever the caller happened to type.
  it("returns the parsed serialisation, not the raw string", () => {
    expect(declineUrl("https://puck.furrycolombia.com")).toBe(
      "https://puck.furrycolombia.com/",
    );
  });
});
