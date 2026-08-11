import { createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Routes reachable without a session. Everything else requires auth.
 *
 * `/sign-in/(.*)` rather than `/sign-in(.*)`: the latter matches any path that
 * merely starts with the string, so a later `/sign-in-admin` would be public
 * without anyone deciding it was. The boundary is the path separator.
 *
 * This list is the whole definition of what is reachable signed-out, which is
 * why it lives in its own module with tests rather than inline in middleware.
 */
const PUBLIC_ROUTES = ["/", "/sign-in", "/sign-in/(.*)"];

export const isPublicRoute = createRouteMatcher(PUBLIC_ROUTES);
