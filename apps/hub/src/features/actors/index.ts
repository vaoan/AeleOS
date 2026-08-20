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
export { isCustomised } from "@/features/actors/domain/actor-theme";
export { readMyProfileTheme } from "@/features/actors/infrastructure/actor-theme";
export {
  isMachineHandle,
  publicName,
} from "@/features/actors/domain/actor-content";
export {
  readActorPage,
  type ActorPage,
} from "@/features/actors/infrastructure/actor-page";
export {
  themeConfiguratorLabels,
  type Translate,
} from "@/features/actors/presentation/theme-labels";
export {
  CANVASES,
  DEFAULT_THEME,
  parseTheme,
  type ActorTheme,
  type CanvasId,
} from "@/features/actors/domain/actor-theme";
export {
  ThemeScope,
  type ThemeScopeProps,
} from "@/features/actors/presentation/theme-scope";
export {
  CONTAINER_MODES,
  LEAF_KINDS,
  type ContainerMode,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
export { DESCRIBED_KINDS } from "@/features/actors/domain/leaf-fields";
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
export {
  SECTION_SHAPES,
  type SectionShape,
} from "@/features/actors/presentation/section-shapes";
export { SPACE_CHOICES } from "@/features/actors/domain/block-edits";
export {
  REQUIRED_KINDS,
  defaultIdentitySection,
  missingRequiredKinds,
  withRequiredBlocks,
  type ActorKind,
} from "@/features/actors/domain/required-blocks";
