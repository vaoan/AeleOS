import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
  "./src/shared/infrastructure/i18n/request.ts",
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The package ships TypeScript source rather than a build, so Next must
  // compile it the way it compiles the app's own files.
  transpilePackages: ["@aeleos/identity"],
};

export default withNextIntl(nextConfig);
