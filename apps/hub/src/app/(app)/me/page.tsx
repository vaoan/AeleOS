import { currentUser } from "@clerk/nextjs/server";
import { ensurePersonActor, getPersonActor } from "@/lib/actors";

/**
 * The signed-in person's identity page.
 *
 * **This page writes.** Rendering it calls `ensurePersonActor`, which
 * provisions an actor row on first visit — idempotently, so a reload creates
 * nothing. That side effect is the reason a person exists in the registry at
 * all, so it must not be moved behind a button or a client component.
 */
export default async function MePage() {
  const user = await currentUser();
  const actorRef = await ensurePersonActor();
  const actor = await getPersonActor(actorRef);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {actor?.displayName ?? user?.firstName ?? "Your identity"}
      </h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-500">Handle</dt>
        <dd>{actor?.handle ?? "—"}</dd>
        <dt className="text-neutral-500">Platform ID</dt>
        <dd className="font-mono text-xs break-all">{actorRef}</dd>
      </dl>
      <p className="text-sm text-neutral-500">
        This ID is the same in every Furry Colombia app.
      </p>
    </section>
  );
}
