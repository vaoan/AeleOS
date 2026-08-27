import type { ActorTheme } from "@/features/actors/domain/actor-theme";
import type { Block } from "@/features/actors/domain/block-schema";
import type { PageContext } from "@/features/actors/presentation/blocks";

/**
 * What the preview document posts to say its listener exists.
 *
 * **The handshake is the iframe's to send, and the parent sends nothing before
 * it.** The obvious alternative — post on the iframe's `load` event — rests on
 * a premise about what has already run: `load` says the DOCUMENT loaded, not
 * that React has committed the effect registering the handler. That is rule 26
 * in the root `CLAUDE.md`, whose lesson is that an ordering argument is only as
 * true as its assumption about the other side, and whose failure mode is not a
 * flake that gets rarer on a faster machine but a deterministic loss on a
 * heavier page.
 */
export const PREVIEW_READY = "aeleos:preview-ready";

/** What the editor posts to hand the preview document a draft to render. */
export const PREVIEW_DRAFT = "aeleos:preview-draft";

/**
 * One draft, as it crosses the document boundary.
 *
 * What the inline preview took as props — the blocks to render, the unsaved
 * theme, the page-level actor facts the identity leaves draw from, and the
 * language being authored — plus the one thing a framed document cannot work
 * out for itself: how tall a screenful of the chosen device is.
 */
export interface PreviewDraft {
  /** Discriminates this from the handshake and from anything else posted. */
  kind: typeof PREVIEW_DRAFT;
  /** The renderable blocks. Already lenient-parsed by the SENDER. */
  blocks: Block[];
  /** The live, unsaved page theme. */
  theme: ActorTheme;
  /** Live actor facts and page-level rendering context. */
  page: PageContext;
  /** The authoring language, which is what the preview renders in. */
  locale: string;
  /**
   * How tall one screenful of the chosen device is, in its own pixels.
   *
   * **The frame is as tall as the whole page, so this is the only way the
   * preview can know where a visitor's screen would end.** It is what the
   * backdrop is banded by: a viewport-anchored background covers a visitor's
   * window and re-anchors as they scroll, and a document-tall frame would
   * otherwise stretch one copy over everything. See `PreviewDocument`.
   */
  deviceHeight: number;
}

/**
 * Whether a value is a non-null object, narrowed for the checks below.
 *
 * @param value - anything that arrived on a message.
 * @returns whether it can be indexed.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * One draft read out of a message, or null for anything unrecognised.
 *
 * **A shape check, and deliberately not a trust boundary.** The channel is
 * same-origin and the caller has already established both `event.origin` and
 * `event.source`; what this adds is that a message which is not a draft — some
 * other library's postMessage traffic, a stale shape from a deployment mid-roll
 * — is ignored rather than rendered. Nothing here is evaluated.
 *
 * Every field is required, `deviceHeight` included: a draft without it would
 * otherwise render with a zero-height backdrop rather than none at all, which
 * is a broken page rather than a missing one.
 *
 * **It does NOT re-validate the block tree**, and that is the point. The sender
 * lenient-parses before posting, so a second schema here would be free to drift
 * from `block-schema` — which is the fault `blocksToSections` and every other
 * duplicated shape in this feature has already been retired for. What arrives
 * is either renderable or it is not this app that sent it.
 *
 * @param data - the `data` of a message event.
 * @returns the draft, or null.
 */
export function readPreviewDraft(data: unknown): PreviewDraft | null {
  if (!isRecord(data)) return null;
  if (data.kind !== PREVIEW_DRAFT) return null;
  if (!Array.isArray(data.blocks)) return null;
  if (!isRecord(data.theme)) return null;
  if (!isRecord(data.page)) return null;
  if (typeof data.locale !== "string") return null;
  if (typeof data.deviceHeight !== "number") return null;
  return data as unknown as PreviewDraft;
}

/**
 * Whether a message is the preview document announcing itself.
 *
 * @param data - the `data` of a message event.
 * @returns whether it is the handshake.
 */
export function isPreviewReady(data: unknown): boolean {
  return isRecord(data) && data.kind === PREVIEW_READY;
}
