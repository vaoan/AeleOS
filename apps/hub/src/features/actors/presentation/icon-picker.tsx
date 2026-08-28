"use client";

import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { Ban } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent } from "react";

/**
 * How many icons the grid will draw at once.
 *
 * Lucide ships well over a thousand and rendering all of them is slow enough to
 * read as broken. A multiple of the eight-column grid, so the panel never ends
 * on a ragged row.
 */
const MAX_VISIBLE = 48;

/** Translated strings {@link IconPicker} renders. */
export interface IconPickerLabels {
  /** Names the trigger. */
  chooseIcon: string;
  /** Labels the search field. */
  searchIcons: string;
  /** Shown when a search matches nothing. */
  noIconsFound: string;
  /** Names the control that removes the icon. */
  clearIcon: string;
  /** Shown on the trigger when there is no icon. */
  noIcon: string;
}

/**
 * What {@link IconPicker} needs.
 *
 * Every field but `label` is required; `label` exists for a page that offers
 * more than one picker and needs to tell them apart.
 */
export interface IconPickerProps {
  /** The stored icon name, which may be empty or not an icon at all. */
  value: string;
  /** Called with the chosen name, or `""` when it is cleared. */
  onChange: (name: string) => void;
  /** Already-translated strings. */
  labels: IconPickerLabels;
  /**
   * What to call this picker, when the page holds more than one.
   *
   * Defaults to `labels.chooseIcon`. A table offers one per row, and several
   * buttons named "Choose an icon" are several controls a screen reader cannot
   * tell apart — which axe cannot flag, because each of them HAS a name. The
   * caller passes a position, exactly as the cell inputs beside it do.
   */
  label?: string;
}

/**
 * Chooses one lucide icon for a section item, or none.
 *
 * **A caller may name it**, which a page holding more than one has to — see
 * {@link IconPickerProps.label}. Unnamed, it is what it always was.
 *
 * **The stored value is checked against `iconNames` before it reaches
 * `DynamicIcon`.** `icon` is free text as far as `0009` is concerned, so a name
 * from anywhere but this picker — an older row, a hand-written payload — must
 * render as the empty state rather than take the editor down. Libra converts
 * PascalCase here because its database holds legacy values; ours holds only
 * what this component wrote, so that conversion is not ported and its whole
 * class of failure with it.
 *
 * **Clearing is offered because `icon` is optional.** A picker with no way back
 * to none makes an optional field permanent the moment somebody touches it.
 *
 * The panel is inline rather than a popover: there is no popover primitive in
 * this app, and building one — portal, positioning, focus trap — is a great
 * deal of surface for a control that overlays nothing. Escape closes it, and so
 * does choosing.
 *
 * The trigger, the search field and the grid are `surface`s, the class a skin styles.
 *
 * Every colour it paints comes from a token — `--accent`, `--edge`, `--muted`, `--on-accent` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the picker.
 */
export function IconPicker({
  value,
  onChange,
  labels,
  label,
}: IconPickerProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return iconNames.slice(0, MAX_VISIBLE);
    return iconNames
      .filter((name) => name.includes(query))
      .slice(0, MAX_VISIBLE);
  }, [search]);

  // Narrowed here rather than trusted: everything below renders the empty state
  // when the stored name is not one lucide has.
  const known = (iconNames as readonly string[]).includes(value)
    ? (value as IconName)
    : undefined;

  /**
   * Closes the panel and forgets what was being searched for.
   */
  const close = (): void => {
    setOpen(false);
    setSearch("");
  };

  /**
   * Reports a choice and closes.
   *
   * @param name - the chosen icon, or `""` to clear it.
   */
  const choose = (name: string): void => {
    onChange(name);
    close();
  };

  // Attached to the native controls rather than to the wrapper. A keydown
  // handler on a plain div is an interactive element without a role, which is
  // both an accessibility fault and a lint error — and every place focus can
  // actually be while the panel is open is a button or an input anyway.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") close();
  };

  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-label={label ?? labels.chooseIcon}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKeyDown}
        className="flex w-fit items-center gap-2 rounded-lg surface border-(--edge)/60 px-2.5 py-1.5 text-sm"
      >
        {known ? (
          <DynamicIcon name={known} className="size-5" />
        ) : (
          <span className="flex items-center gap-1.5 text-(--muted)">
            <Ban className="size-4" />
            <span className="text-xs">{labels.noIcon}</span>
          </span>
        )}
      </button>

      {open ? (
        <div
          id={panelId}
          className="grid gap-2 rounded-lg surface border-(--edge) bg-(--surface) p-2"
        >
          <div className="flex items-center gap-2">
            <input
              type="search"
              aria-label={labels.searchIcons}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={onKeyDown}
              className="min-w-0 flex-1 rounded-lg surface border-(--edge)/60 bg-transparent px-2.5 py-1.5 text-sm"
            />
            <button
              type="button"
              aria-label={labels.clearIcon}
              onClick={() => choose("")}
              onKeyDown={onKeyDown}
              className="rounded-lg p-1.5 text-(--muted)"
            >
              <Ban className="size-4" />
            </button>
          </div>

          {filtered.length === 0 ? (
            <p className="px-1 py-3 text-center text-xs text-(--muted)">
              {labels.noIconsFound}
            </p>
          ) : (
            <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto">
              {filtered.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  aria-pressed={name === value}
                  onClick={() => choose(name)}
                  onKeyDown={onKeyDown}
                  className="flex size-8 items-center justify-center rounded-md text-(--muted) aria-pressed:bg-(--accent) aria-pressed:text-(--on-accent)"
                >
                  <DynamicIcon name={name} className="size-4" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
