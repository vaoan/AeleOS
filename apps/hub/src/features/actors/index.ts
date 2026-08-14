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
export {
  listMyActors,
  createFursona,
  updateFursona,
  HandleTakenError,
  FursonaLimitError,
  type Actor,
} from "@/features/actors/infrastructure/fursonas";
export { readMyAddress } from "@/features/actors/infrastructure/my-address";
export {
  updateMyProfile,
  type MyProfileInput,
} from "@/features/actors/infrastructure/my-profile";
export {
  MyProfileForm,
  type MyProfileFormLabels,
} from "@/features/actors/presentation/my-profile-form";
export {
  uploadActorImage,
  removeActorImages,
  ImageRefusedError,
} from "@/features/actors/infrastructure/actor-images";
export {
  IMAGE_LIMITS,
  refuseImage,
} from "@/features/actors/domain/image-limits";
export {
  readPublicPerson,
  readPublicFursona,
  type PublicActor,
  type PublicFursonaSummary,
} from "@/features/actors/infrastructure/public-actors";
export {
  PublicProfile,
  type PublicProfileProps,
} from "@/features/actors/presentation/public-profile";
export {
  FURSONA_TEMPLATES,
  type FursonaTemplate,
} from "@/features/actors/domain/fursona-templates";
export {
  applyFursonaFilters,
  isFiltering,
  type FursonaFilters,
} from "@/features/actors/domain/fursona-filters";
export {
  VISIBILITIES,
  parseFursona,
  type FursonaFormState,
  type FursonaInput,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";
export {
  SECTION_TYPES,
  type SectionType,
} from "@/features/actors/domain/section-schema";
export {
  ActorTile,
  type ActorTileProps,
} from "@/features/actors/presentation/actor-tile";
export {
  FursonaList,
  type FursonaListLabels,
} from "@/features/actors/presentation/fursona-list";
export {
  FursonaEditor,
  type FursonaEditorLabels,
} from "@/features/actors/presentation/fursona-editor";
