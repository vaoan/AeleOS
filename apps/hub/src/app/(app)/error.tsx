"use client";

/**
 * Failure boundary for every signed-in page.
 *
 * /me provisions and reads the actor registry while rendering, so a database
 * outage or an RLS denial surfaces here. It must say so plainly: the failure
 * mode this replaces rendered a page that looked like an identity with no
 * details in it, which reads as "you have no fursonas" rather than "we could
 * not reach the database".
 *
 * The raw message is deliberately not shown — it can carry view, policy and
 * connection details. The digest is what support needs to find the server log.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section role="alert" className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-neutral-400">
        We could not load your identity. This is a problem on our side, not with
        your account — your sign-in is unaffected.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
      >
        Try again
      </button>
      {error.digest ? (
        <p className="font-mono text-xs text-neutral-600">
          Reference: {error.digest}
        </p>
      ) : null}
    </section>
  );
}
