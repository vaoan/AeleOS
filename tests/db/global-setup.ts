import { execSync } from "node:child_process";

/** Documented default for local Supabase stacks; overridden if status reports one. */
const LOCAL_JWT_SECRET_FALLBACK =
  "super-secret-jwt-token-with-at-least-32-characters-long";

export default function setup(): void {
  const json = execSync("supabase status -o json", { encoding: "utf8" });
  const s = JSON.parse(json) as Record<string, string>;

  process.env.SUPABASE_URL = s.API_URL;
  process.env.SUPABASE_ANON_KEY = s.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = s.SERVICE_ROLE_KEY;
  process.env.SUPABASE_DB_URL = s.DB_URL;
  process.env.SUPABASE_JWT_SECRET = s.JWT_SECRET ?? LOCAL_JWT_SECRET_FALLBACK;
}
