/**
 * The picker feature's public API — where a person chooses who to act as.
 *
 * `isAllowedReturnTo` lives here: the picker is the only thing in the hub
 * that sends someone to another app's `return_to` on the way out, so nothing
 * else needs it. Its sibling guard `isInternalPath` is **not** re-exported
 * here, though it once was: it lives in `@/shared/domain/return-to` because
 * `resolveAfterSignInUrl` (`shared/infrastructure/request-locale.ts`) needs
 * the same "stays on this origin" check and `shared/` may not import a
 * feature. Offering both names from the picker's own barrel put the wrong one
 * one autocomplete away from the call sites that guard `return_to`, and the
 * two are not interchangeable in either direction: `isInternalPath` consults
 * no allowlist at all, which is precisely the check a `return_to` must never
 * be given. The re-export existed only so a test could import both guards from
 * one path — not a reason worth that.
 *
 * `PickerGrid` renders the choice but knows nothing about actors: it takes the
 * tiles as children and the action as a prop. That is not indirection for its
 * own sake — this feature may not import `@/features/actors`, so the page in
 * `app/`, which may import both barrels, is where the two meet.
 */
export {
  isAllowedReturnTo,
  declineUrl,
} from "@/features/picker/domain/return-to";
export {
  PickerGrid,
  type PickerGridProps,
} from "@/features/picker/presentation/picker-grid";
