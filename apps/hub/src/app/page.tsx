/**
 * The marketing home page — the only route reachable without a session.
 *
 * Public by way of `PUBLIC_ROUTES`; changing that list is what makes a route
 * reachable signed-out, not anything here.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-24">
      <h1 className="text-3xl font-semibold">AeleOS</h1>
      <p className="text-neutral-400">Your identity across Furry Colombia.</p>
    </main>
  );
}
