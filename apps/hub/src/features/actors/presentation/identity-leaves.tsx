import type { ReactNode } from "react";
import {
  contentFor,
  isMachineHandle,
} from "@/features/actors/domain/actor-content";
import type {
  LeafProps,
  LeafRenderer,
} from "@/features/actors/presentation/block-contract";
import { FursonaCardList } from "@/features/actors/presentation/fursona-card-list";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * The label an identity leaf shows above its value.
 *
 * **Every leaf must carry a title** — `title_en` is required and non-empty at
 * the strict write and again in `validate_block` — so these leaves use theirs
 * rather than carrying a field that renders nowhere.
 *
 * Whether to show it at all is each caller's own ternary rather than an
 * argument here, matching how `PlainLeaf` reads `labelled` in `blocks.tsx`.
 * A boolean parameter selecting between two behaviours is what
 * `sonarjs/no-selector-parameter` is for, and it would be one here.
 *
 * @param props - the leaf and the locale to resolve its title in.
 * @returns the label.
 */
function labelOf(props: LeafProps): string {
  return contentFor(props.leaf, "title", props.locale);
}

/** The label element, shared so the identity leaves cannot drift apart. */
function Label({ text }: { text: string }): ReactNode {
  return text ? (
    <span className="font-display text-[0.75em]/tight font-bold text-(--muted)">
      {text}
    </span>
  ) : null;
}

/**
 * The actor's own portrait.
 *
 * **The leaf's title is the picture's ALT TEXT**, not a caption, and that is
 * the one genuinely useful thing to do with the field the model insists every
 * leaf carries. It is the only place a screen reader learns whose portrait
 * this is; the visible name is a separate block its author may have put
 * anywhere, or nowhere near this one.
 *
 * An actor with no picture gets the dashed placeholder the welded header used,
 * rather than nothing: a portrait somebody has not set yet is a gap they can
 * see and fill, where an absent element looks like a page that failed to load.
 *
 * `next/image` is deliberately not used — the address is arbitrary and pasted
 * by hand, so it would try to optimise a host it has never been configured
 * for. Same reasoning, same disable, as `PictureLeaf`.
 *
 * Typed by the shared `LeafRenderer` from `block-contract.ts`, which is the
 * same contract every content kind speaks. This module used to restate that
 * shape rather than import it, to avoid depending on the file that registers
 * it; the contract moved out of `blocks.tsx` instead.
 *
 * **How it fills its circle is the block's to choose.** The `<img>` reads
 * `--img-fit`, which `blockStyle` emits for `image_fit` and which falls back
 * to the `cover` declared at `:root` — so a portrait is still cropped to its
 * edges by default, and a WIDE picture can be asked to show whole instead.
 * That case is not hypothetical: a 94x45 wordmark came through this circle as
 * two meaningless fragments.
 *
 * @param props - the leaf, the locale, whether it still owes its title, and
 *   the page it renders from.
 * @returns the portrait.
 */
export const AvatarLeaf: LeafRenderer = (props) => {
  const { labelled, page } = props;
  const alt = labelled ? labelOf(props) : "";
  return page.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for.
    <img
      src={page.avatarUrl}
      alt={alt}
      className="size-24 rounded-full surface border-(--edge) [object-fit:var(--img-fit)]"
      {...tid("block-avatar")}
    />
  ) : (
    <span
      className="block size-24 rounded-full surface border-dashed border-(--edge)"
      {...tid("block-avatar")}
    />
  );
};

/**
 * What names this actor in an address bar.
 *
 * **On a person's page this is their ADDRESS, never their handle.** A person
 * is minted as `u-<actor_ref with the hyphens out>`, which is that reference
 * in a thin disguise and, on a person, the `owner_ref` of every fursona they
 * own — the exact column `/api/actors/mine` strips by name. Their address is
 * what belongs here anyway: it is what a stranger typed to arrive, and it is
 * the community number the design calls worth awarding.
 *
 * A fursona's handle is chosen, is already in its address, and shows as it is.
 *
 * **It carries the `public-actor-name` test id**, which the end-to-end suite
 * reads as "this page loaded and names its actor". That id rode the welded
 * header's heading; it belongs here rather than on `NameLeaf` because this
 * kind is required on every page and a display name is optional.
 *
 * Typed by the shared `LeafRenderer` from `block-contract.ts`, which is the
 * same contract every content kind speaks. This module used to restate that
 * shape rather than import it, to avoid depending on the file that registers
 * it; the contract moved out of `blocks.tsx` instead.
 *
 * @param props - the leaf, the locale, whether it still owes its title, and
 *   the page it renders from.
 * @returns the handle or the address.
 *
 * Its type sizes are `em`-relative so a page's `spacing` reaches them; at the
 * default spacing they resolve to exactly the `rem` values they replaced.
 */
export const HandleLeaf: LeafRenderer = (props) => (
  <span className="grid gap-1" {...tid("block-handle")}>
    <Label text={props.labelled ? labelOf(props) : ""} />
    {/* **`public-actor-name` lives here, not on the display name.** It is the
        end-to-end suite's proxy for "this page loaded and names its actor",
        and it has to sit on the element that is always present: `handle` is
        required on every page and `name` renders nothing when nobody set a
        display name. It rode the welded header's <h1> until that header became
        blocks. */}
    <span
      className="font-mono text-[0.875em] text-(--muted)"
      {...tid("public-actor-name")}
    >
      {isMachineHandle(props.page.handle)
        ? props.page.address
        : props.page.handle}
    </span>
  </span>
);

/**
 * The display name, when there is one.
 *
 * **It renders nothing when the actor has set no display name**, and that is
 * not the "a control that accepts a choice and changes nothing" failure this
 * repo keeps catching. It draws nothing because the person has not written
 * their name yet; the cause is theirs, it is visible in their own editor, and
 * it is fixable from a field they can see.
 *
 * What makes that safe is that `handle` is REQUIRED on every page — there is
 * always something naming an actor, so the display name is decoration on top
 * of a guarantee rather than the guarantee itself. See
 * `domain/required-blocks.ts`.
 *
 * Typed by the shared `LeafRenderer` from `block-contract.ts`, which is the
 * same contract every content kind speaks. This module used to restate that
 * shape rather than import it, to avoid depending on the file that registers
 * it; the contract moved out of `blocks.tsx` instead.
 *
 * @param props - the leaf, the locale, whether it still owes its title, and
 *   the page it renders from.
 * @returns the name, or nothing.
 */
export const NameLeaf: LeafRenderer = (props) =>
  props.page.displayName ? (
    <span className="grid gap-1" {...tid("block-name")}>
      <Label text={props.labelled ? labelOf(props) : ""} />
      <span className="font-display text-3xl font-extrabold tracking-tight wrap-break-word @sm:text-4xl">
        {props.page.displayName}
      </span>
    </span>
  ) : null;

/**
 * A link back to the person who owns this fursona.
 *
 * **The address always shows; the owner's name and portrait only sometimes**,
 * and this component decides neither. A fursona's page is governed by the
 * fursona's visibility rather than its owner's, so a public character
 * routinely belongs to somebody whose own profile 404s — `public_fursona`
 * withholds their name and picture in that case and this renders what it is
 * given. Re-deriving the rule here would be a second copy of it, free to drift
 * from the one the database enforces.
 *
 * The address is safe unconditionally: it is already the first segment of this
 * page's own URL.
 *
 * It renders nothing on a person's page, where `owner` is absent.
 *
 * **That state was reachable through the editor until 2026-08-27, and this
 * comment said it was not.** `set_actor_sections` refuses `owner` on a
 * person's page, but the kind select offered every leaf kind on every page —
 * so somebody could pick it, and the save came back as a database exception
 * with no block marked. The select is narrowed by `offerableLeafKinds` now and
 * `leaf-kind-options.test.tsx` is what keeps it narrowed. This branch is a
 * belt again rather than a case anybody meets, which is what it always claimed
 * to be.
 *
 * The owner's small portrait reads `--img-fit` like every other picture here,
 * so a block asking for `contain` reaches this one too rather than only the
 * avatar beside it.
 *
 * Typed by the shared `LeafRenderer` from `block-contract.ts`, which is the
 * same contract every content kind speaks. This module used to restate that
 * shape rather than import it, to avoid depending on the file that registers
 * it; the contract moved out of `blocks.tsx` instead.
 *
 * @param props - the leaf, the locale, whether it still owes its title, and
 *   the page it renders from.
 * @returns the link, or nothing when there is no owner.
 *
 * Its type sizes are `em`-relative so a page's `spacing` reaches them; at the
 * default spacing they resolve to exactly the `rem` values they replaced.
 */
export const OwnerLeaf: LeafRenderer = (props) => {
  const { labelled, page } = props;
  const owner = page.owner;
  if (!owner) return null;
  return (
    <span className="grid gap-1" {...tid("block-owner")}>
      <Label text={labelled ? labelOf(props) : ""} />
      <Link
        href={`/${owner.address}`}
        className="flex items-center gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-4"
      >
        {owner.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- as elsewhere here, the address is arbitrary and pasted.
          <img
            src={owner.avatarUrl}
            alt=""
            className="size-10 shrink-0 rounded-full surface border-(--edge) [object-fit:var(--img-fit)]"
          />
        ) : null}
        <span className="grid min-w-0 gap-0.5">
          {owner.displayName ? (
            <span className="truncate font-display text-[0.875em] font-bold">
              {owner.displayName}
            </span>
          ) : null}
          <span className="font-mono text-[0.75em] text-(--muted)">
            {owner.address}
          </span>
        </span>
      </Link>
    </span>
  );
};

/**
 * The actor's public fursonas.
 *
 * **The heading is its author's own words**, falling back to the catalogue
 * string the route resolves. That fallback is what a block with no title
 * shows; a missing `title_es` is somebody who has not written the Spanish yet
 * and must never be reported as a fault, which is the line the studio port
 * drew between a person's writing and next-intl.
 *
 * Which fursonas appear is settled by `public_person` in `0012` — only the
 * public ones — and nothing here re-derives it.
 *
 * It renders nothing on a fursona's page, where `fursonas` is absent and the
 * kind is refused at the write.
 *
 * Typed by the shared `LeafRenderer` from `block-contract.ts`, which is the
 * same contract every content kind speaks. This module used to restate that
 * shape rather than import it, to avoid depending on the file that registers
 * it; the contract moved out of `blocks.tsx` instead.
 *
 * @param props - the leaf, the locale, whether it still owes its title, and
 *   the page it renders from.
 * @returns the list, or nothing when this page has none.
 *
 * Its type sizes are `em`-relative so a page's `spacing` reaches them; at the
 * default spacing they resolve to exactly the `rem` values they replaced.
 */
export const FursonasLeaf: LeafRenderer = (props) => {
  const { leaf, locale, page } = props;
  if (!page.fursonas) return null;
  const title = contentFor(leaf, "title", locale) || page.fursonasFallbackTitle;
  // **An empty list still shows its heading.** `FursonaCardList` answers null
  // for an empty list, which was right when it was chrome the page appended
  // and is wrong now that it is a block somebody deliberately placed: a leaf
  // that renders nothing leaves a hole in a grid track that nothing on the
  // page explains. `stat` and `table` already settle this the same way —
  // drop the rows, keep the author's own words. See `LEAF_KINDS`.
  //
  // It also makes the editor's preview honest, where the list is empty by
  // construction because the route does not load it.
  if (page.fursonas.length === 0) {
    return (
      <section className="grid gap-3" {...tid("block-fursonas")}>
        <h2 className="font-display text-[1.125em] font-bold tracking-tight">
          {title}
        </h2>
      </section>
    );
  }
  return (
    <div {...tid("block-fursonas")}>
      <FursonaCardList
        address={page.address}
        fursonas={page.fursonas}
        title={title}
      />
    </div>
  );
};
