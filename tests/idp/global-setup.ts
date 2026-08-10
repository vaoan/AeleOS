import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export default function setup(): void {
  // Load .secrets if present. Absent is fine — the tests skip themselves.
  if (existsSync(".secrets")) {
    for (const line of readFileSync(".secrets", "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }

  const hasCreds = (process.env.CLERK_SESSION_TOKEN ?? "").length > 0;

  // The stack is only required when there is actually something to validate.
  // Without credentials every suite skips, and demanding a running stack here
  // would turn a clean skip into a hard failure — this must stay runnable with
  // no secrets and no Docker.
  let json: string;
  try {
    json = execSync("supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (cause) {
    if (hasCreds) {
      throw new Error(
        "CLERK_SESSION_TOKEN is set but the local Supabase stack is not running. " +
          "Start it with `pnpm exec supabase start` (it needs Docker), then re-run.",
        { cause },
      );
    }
    return;
  }

  const s = JSON.parse(json) as Record<string, string>;
  process.env.SUPABASE_URL = s.API_URL;
  process.env.SUPABASE_ANON_KEY = s.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = s.SERVICE_ROLE_KEY;
  process.env.SUPABASE_DB_URL = s.DB_URL;
}
