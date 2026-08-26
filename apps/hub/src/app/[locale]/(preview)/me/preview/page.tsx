import { PreviewDocument } from "@/features/actors";

/**
 * The document the editor's complete preview frames.
 *
 * **It is deliberately OUTSIDE the `(app)` route group**, and that placement is
 * the whole reason this file exists where it does. `(app)/layout.tsx` renders
 * `PageShell` with the signed-in bar, and a preview wearing the app's chrome is
 * not a preview of anybody's page. Sitting in `(preview)` instead, it inherits
 * only `[locale]/layout.tsx` — a real `<html>`, a real `<body>` painting the
 * field, the pre-paint theme scripts, and the canvas — which is exactly the
 * document a visitor gets.
 *
 * **`me/preview` rather than `preview`, and that is not cosmetic.** A static
 * segment directly under `[locale]` permanently reserves that word against the
 * person-address namespace — see the actors feature note — so `/preview` would
 * cost somebody the vanity `preview` for ever. `me` is already reserved and has
 * no dynamic sibling. `/pages/preview` would also have cost nothing new but
 * would shadow a fursona whose handle is `preview`.
 *
 * Two route groups may both hold a `me` segment: only routes resolving to the
 * SAME URL path conflict, confirmed against
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`
 * rather than from memory, per this app's `AGENTS.md`.
 *
 * It reads nothing and authorizes nothing. Everything it renders arrives by
 * `postMessage` from the editor that framed it, so opening this address
 * directly gives an empty page.
 *
 * @returns the preview document.
 */
export default function PreviewPage() {
  return <PreviewDocument />;
}
