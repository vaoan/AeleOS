import type { Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Whether a real Clerk instance is reachable.
 *
 * @returns true when the backend key is present.
 */
export const hasClerk = (): boolean =>
  Boolean(process.env.CLERK_SECRET_KEY?.length);

/**
 * Calls Clerk's backend API.
 *
 * @param path - the path under `/v1`.
 * @param init - fetch options.
 * @returns the parsed body, or null when there is none.
 */
async function backend(path: string, init: RequestInit = {}): Promise<never> {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY as string}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Clerk ${path} ${response.status}: ${body.slice(0, 300)}`);
  }
  return (body ? JSON.parse(body) : null) as never;
}

/** A throwaway identity. */
export interface TestIdentity {
  /** Clerk's user id: mint tickets from it, and delete it afterwards. */
  userId: string;
}

/**
 * Creates a Clerk user that exists only for one test.
 *
 * **This is what makes a signed-in end-to-end test possible at all.** Every
 * suite in this folder was anonymous because driving Google's or Discord's real
 * login is outside our control — and this app is social-login-first with no
 * passwords, so there is no form to fill in either. A **sign-in token** is
 * Clerk's own answer: the backend mints a one-shot ticket for a user, the
 * browser presents it, and a real session results without any provider, any
 * password, or any interface.
 *
 * The user is created fresh per run and deleted afterwards, exactly as the
 * `idp-cloud` script already does. What it leaves behind is an `actors` row in
 * the live database whose `identity_sub` names a user that no longer exists —
 * harmless, already true of that script, and the price of testing against the
 * real thing rather than a mock.
 *
 * @returns the identity and its ticket.
 */
export async function createTestIdentity(): Promise<TestIdentity> {
  const user = await backend("/users", {
    method: "POST",
    body: JSON.stringify({
      email_address: [
        `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
      ],
      first_name: "End",
      last_name: "ToEnd",
      // The instance has no password strategy — it is social-login-first — so
      // creating a user without this is refused.
      skip_password_requirement: true,
    }),
  });

  return { userId: (user as unknown as { id: string }).id };
}

/**
 * Mints one sign-in ticket.
 *
 * **A ticket is single-use**, so this is called per test rather than once for
 * the suite. Reusing one signs in the first browser and fails every one after
 * it — which is exactly how the second test in this folder failed, and is worth
 * knowing before somebody hoists this into `beforeAll` to save a call.
 *
 * @param userId - whose ticket.
 * @returns the ticket.
 */
export async function mintTicket(userId: string): Promise<string> {
  const token = await backend("/sign_in_tokens", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 600 }),
  });
  return (token as unknown as { token: string }).token;
}

/**
 * Removes the identity again.
 *
 * Deliberately swallows a failure: a test that has already asserted what it
 * came for must not be reported as broken because cleanup could not reach
 * Clerk. A leftover user in a development instance costs nothing.
 *
 * @param userId - whom to delete.
 */
export async function deleteTestIdentity(userId: string): Promise<void> {
  try {
    await backend(`/users/${userId}`, { method: "DELETE" });
  } catch {
    // Nothing to do about it, and nothing depends on it.
  }
}

/**
 * Signs the browser in, with no interface.
 *
 * **Nothing in the application changes to make this possible**, which was the
 * point of choosing this route. The first attempt put a `__clerk_ticket` in the
 * URL, which only works with Clerk's own `<SignIn />` component — and this app
 * deliberately renders its own buttons instead, because that component insists
 * on an email field, a password path and a sign-up link, none of which exist
 * here. Handling the ticket ourselves would have meant adding an authentication
 * path to production for the benefit of a test.
 *
 * `@clerk/testing` avoids that: it drives the Clerk JS the page has already
 * loaded, so the session is established exactly as the running app would
 * establish one.
 *
 * `setupClerkTestingToken` is not optional. A development instance applies bot
 * protection to sign-in attempts, and an automated browser looks precisely like
 * a bot; the token is Clerk's own way of saying this one is expected.
 *
 * @param page - the browser page.
 * @param ticket - the one-shot sign-in token.
 */
export async function signIn(page: Page, ticket: string): Promise<void> {
  await setupClerkTestingToken({ page });
  // Any page that loads Clerk will do; the sign-in page is the honest one to
  // pick because it is where somebody would really be.
  await page.goto("/es/sign-in");
  await clerk.signIn({ page, signInParams: { strategy: "ticket", ticket } });
}
