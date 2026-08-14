import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./src/shared/domain/csp";

const withNextIntl = createNextIntlPlugin(
  "./src/shared/infrastructure/i18n/request.ts",
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The package ships TypeScript source rather than a build, so Next must
  // compile it the way it compiles the app's own files.
  transpilePackages: ["@aeleos/identity"],

  /**
   * The security headers, on every route.
   *
   * Applied here rather than in `proxy.ts` because the policy is the same for
   * every request: a per-request header would only be needed for a nonce, and
   * this policy deliberately does not use one — see `csp.ts` for what that
   * costs and what it buys.
   *
   * @returns one rule covering every path.
   */
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default withNextIntl(nextConfig);
