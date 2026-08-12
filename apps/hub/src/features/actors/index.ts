/**
 * The actor feature's public API — the person actor behind /me.
 *
 * Fursonas and the picker join this feature rather than becoming their own:
 * a person actor and a fursona actor are rows in the same table under the same
 * ownership ledger, so splitting them would put `actor_ref` in two features'
 * domains and force the cross-feature import the boundary rules forbid.
 */
export {
  ensurePersonActor,
  getPersonActor,
  type PersonActor,
} from "@/features/actors/infrastructure/actors";
