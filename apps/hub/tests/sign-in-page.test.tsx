import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// PageShell/Card pull in LanguageToggle, whose module top level calls
// next-intl's createNavigation() against the real "next/navigation" — not
// reachable outside a request. Nothing in this suite renders the tree (see
// findByType below), but merely importing the page still imports that chain,
// so the module is stubbed the same way fursona-edit-page.test.tsx does.
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: "a",
  redirect: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
  getPathname: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/features/session", () => ({
  PROVIDERS: [{ id: "discord", strategy: "oauth_discord", name: "Discord" }],
  // Identity components: never rendered, only referenced as element types so
  // the props the page handed them can be inspected directly.
  SignInForm: () => null,
  SsoCallback: () => null,
}));

const { default: SignInPage } =
  await import("@/app/[locale]/sign-in/[[...sign-in]]/page");
const { SignInForm } = await import("@/features/session");

/**
 * The first descendant of the given type in a page's returned element tree,
 * found without rendering anything.
 *
 * @param node - the element (or child) to search from.
 * @param type - the component reference to search for.
 * @returns the matching element.
 */
function findByType(node: unknown, type: unknown): ReactElement {
  if (node && typeof node === "object") {
    const element = node as ReactElement;
    if (element.type === type) return element;
    const children = (element.props as { children?: unknown } | undefined)
      ?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      try {
        return findByType(child, type);
      } catch {
        // Keep looking among the remaining children.
      }
    }
  }
  throw new Error("Element not found");
}

describe("SignInPage", () => {
  // F2: Clerk uses callbackUrl directly, unresolved, for the first-time
  // social-login leg — a brand new person has no session yet, so
  // afterSignInUrl (which only reaches Clerk once a session exists) never
  // gets a chance to carry the destination there. Without this every new
  // user's return_to was silently dropped.
  it("carries the destination onto the SSO callback leg", async () => {
    const page = (await SignInPage({
      params: Promise.resolve({ locale: "es" }),
      searchParams: Promise.resolve({ redirect_url: "/es/picker?app=Puck" }),
    })) as ReactElement;

    const form = findByType(page, SignInForm);
    expect(form.props).toMatchObject({
      afterSignInUrl: "/es/picker?app=Puck",
      // cspell:ignore Fpicker Fapp -- percent-encoding, not words
      callbackUrl:
        "/es/sign-in/sso-callback?redirect_url=%2Fes%2Fpicker%3Fapp%3DPuck",
    });
  });

  it("omits redirect_url from the callback leg when there is no destination", async () => {
    const page = (await SignInPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({}),
    })) as ReactElement;

    const form = findByType(page, SignInForm);
    expect(form.props).toMatchObject({
      afterSignInUrl: "/en/me",
      callbackUrl: "/en/sign-in/sso-callback",
    });
  });

  // The array shape a repeated query key produces (F1) must not reach
  // startsWith and throw — it has to resolve to the same safe default as any
  // other refused destination, on the page that must never 500.
  it("does not throw when redirect_url repeats into an array", async () => {
    const page = (await SignInPage({
      params: Promise.resolve({ locale: "es" }),
      searchParams: Promise.resolve({ redirect_url: ["a", "b"] }),
    })) as ReactElement;

    const form = findByType(page, SignInForm);
    expect(form.props).toMatchObject({
      afterSignInUrl: "/es/me",
      callbackUrl: "/es/sign-in/sso-callback",
    });
  });
});
