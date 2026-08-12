import { UserButton } from "@clerk/nextjs";

/**
 * The shell for signed-in pages: header, user button, centred content.
 *
 * Being inside the `(app)` route group carries no protection on its own —
 * `middleware.ts` is what requires a session. This layout only assumes one.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <span className="font-semibold">AeleOS</span>
        <UserButton />
      </header>
      <main className="mx-auto max-w-2xl px-6 py-12">{children}</main>
    </div>
  );
}
