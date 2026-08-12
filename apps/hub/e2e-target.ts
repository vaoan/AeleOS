/**
 * Where the Playwright suite points, and whether it must start a server itself.
 *
 * `startsServer` is false when targeting an already-deployed site: starting a
 * local dev server in that case would take 120 seconds and then test the wrong
 * thing.
 */
export type E2ETarget = {
  baseURL: string;
  startsServer: boolean;
};

const LOCAL = "http://localhost:5100";

/**
 * Where the Playwright suite should point.
 *
 * With `PLAYWRIGHT_BASE_URL` set, the suite runs against an already-deployed
 * site and must not start a dev server. Without it, it starts one locally.
 *
 * The parameter is typed to the one variable this reads rather than to
 * `NodeJS.ProcessEnv`: Next augments that interface with a required `NODE_ENV`,
 * so a test could not pass a plain `{}` to exercise the default branch.
 *
 * @param env - the environment to read; injected in tests so they need not
 * mutate the real one.
 * @returns the target URL and whether Playwright must start a server for it.
 */
export function e2eTarget(
  env: Record<string, string | undefined> = process.env,
): E2ETarget {
  const deployed = env.PLAYWRIGHT_BASE_URL?.trim();
  if (!deployed) return { baseURL: LOCAL, startsServer: true };
  return { baseURL: deployed.replace(/\/+$/, ""), startsServer: false };
}
