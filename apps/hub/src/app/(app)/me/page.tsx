import { currentUser } from "@clerk/nextjs/server";

export default async function MePage() {
  const user = await currentUser();
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Signed in</h1>
      <p className="text-neutral-400">Clerk subject: {user?.id}</p>
    </section>
  );
}
