import { z } from "zod";

/**
 * The visibility values the database accepts.
 *
 * Kept in the same order as the `actors_visibility` check constraint in
 * `0001_actors.sql`. If that constraint changes, this list is the other half
 * of the change — a value accepted here and rejected there surfaces as a
 * database error at submit time rather than a field error in the form.
 */
export const VISIBILITIES = ["private", "unlisted", "public"] as const;

/** One of the visibility values the database accepts. */
export type Visibility = (typeof VISIBILITIES)[number];

/** Characters a handle may contain. Also what makes it safe in a URL path. */
const HANDLE_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Schemes an avatar URL may use. */
const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Whether a string is a URL we are willing to put in an `img` tag.
 *
 * Naming the allowed schemes rather than rejecting known-bad ones is
 * deliberate: `javascript:` and `data:` are script-execution vectors in an
 * `src`, and a denylist is a promise to have thought of every scheme.
 *
 * @param value - the candidate URL.
 * @returns true when it parses and uses http or https.
 */
function isSafeUrl(value: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Validation for the fursona form, shared by the form and the server action.
 *
 * It lives in `domain/` so both can depend on it without depending on each
 * other — the client form imports it to render inline errors, and the server
 * action imports it to re-validate, because a client-side check is a
 * convenience and never a control.
 */
export const fursonaSchema = z.object({
  handle: z.string().trim().min(1).max(32).regex(HANDLE_PATTERN),
  displayName: z.string().trim().max(64),
  avatarUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || isSafeUrl(v)),
  visibility: z.enum(VISIBILITIES),
});

/** A validated fursona, as the form collects it. */
export type FursonaInput = z.infer<typeof fursonaSchema>;

/**
 * What a submitted form gets back: error codes keyed by field name.
 *
 * Lives here rather than beside the server action because both the action and
 * the form component need it, and a type owned by either one would make the
 * other depend on it — the form is in `presentation/` and the action is in
 * `app/`, so that dependency would run the wrong way through the layers.
 */
export type FursonaFormState = { errors: Record<string, string> };

/** The result of validating raw form input. */
export type ParseResult =
  | { ok: true; value: FursonaInput }
  | { ok: false; errors: Record<string, string> };

/**
 * Validates raw form input, returning field-keyed errors rather than throwing.
 *
 * The error map is keyed by field name so a form can render each message
 * beside its input. Messages are error *codes*, not prose: the caller
 * translates them, because this module has no locale and must not acquire one.
 *
 * @param raw - unvalidated input, typically from `FormData`.
 * @returns the parsed value, or the errors keyed by field.
 */
export function parseFursona(raw: unknown): ParseResult {
  const parsed = fursonaSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) errors[key] = issue.code;
  }
  // A non-object input produces an issue with an empty path and would
  // otherwise yield an empty error map, which a form would render as "valid".
  if (Object.keys(errors).length === 0) errors.handle = "invalid_type";
  return { ok: false, errors };
}
