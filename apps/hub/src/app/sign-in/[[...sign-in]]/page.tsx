import { SignIn } from "@clerk/nextjs";

/**
 * The sign-in page, rendering Clerk's component in our own shell.
 *
 * The optional catch-all segment is required by Clerk: it routes its own
 * sub-steps — factor-one, SSO callbacks — beneath this path. Narrowing the
 * route breaks those flows.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <SignIn />
    </main>
  );
}
