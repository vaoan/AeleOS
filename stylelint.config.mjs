/**
 * CSS linting, mirroring the sister repos.
 *
 * AeleOS was the only one of the three with no CSS linting at all, which is how
 * `globals.css` grew a rule that beat every Tailwind utility unconditionally
 * without anything noticing. The base is Puck's and Libra's config verbatim;
 * what differs is written down below with the reason.
 *
 * @type {import('stylelint').Config}
 */
export default {
  extends: ["stylelint-config-standard", "stylelint-config-tailwindcss"],
  rules: {
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "apply",
          "layer",
          "tailwind",
          "variants",
          "responsive",
          "screen",
          "keyframes",
          "font-face",
          "custom-variant",
          "theme",
          // Tailwind v4's custom-utility API. The sisters do not list it yet;
          // it is here so reaching for the framework's own escape hatch is not
          // blocked by the linter that exists to keep us on it.
          "utility",
        ],
      },
    ],
    "custom-property-pattern": [
      "^(--)?[a-z0-9][a-z0-9-]*(--[a-z0-9-]+)?$",
      {
        message:
          "Expected custom property name to be kebab-case; Tailwind theme line-height tokens may include a double dash.",
      },
    ],

    // **Do not select the `class` attribute.** This is the rule the whole
    // adoption was for.
    //
    // `globals.css` used to carry `[class~="border"]` — Tailwind's own
    // generated class, selected as if it were ours. It reached the right
    // elements and could not see what any of them was asking for, and being
    // unlayered it beat every utility whatever their specificity. One element
    // lost its `backdrop-blur` that way with nothing to report it, and the
    // repair was a hand-written `:not()` per collision anybody happened to
    // notice.
    //
    // Selecting a class attribute is how that shape starts every time: it is
    // the move that reaches into the framework's output instead of styling
    // something we own. `.surface` is what replaced it. `[data-theme]` and the
    // other data attributes are untouched by this rule — they are ours.
    "selector-attribute-name-disallowed-list": [
      ["class"],
      {
        message:
          "Do not select the class attribute — that reaches into Tailwind's generated output, which cannot see what the element asked for. Give the element a class of your own (see @utility surface) and style that.",
      },
    ],

    // **Off, and not for convenience.** `globals.css` declares `:root` three
    // times on purpose: the palette, the form tokens a skin overrides, and the
    // geometry the sticky bars share. Each block carries the argument for its
    // own values, and the rule's remedy — one merged block — would bury three
    // separate concerns in a single wall of custom properties. The duplication
    // it warns about is real and is the point.
    "no-duplicate-selectors": null,

    // **Off, because `--fix` used it to delete a `-webkit-` prefix and leave a
    // real duplicate behind.** `stylelint-config-standard` bans vendor
    // prefixes on the assumption that autoprefixer is downstream. Nothing here
    // is: this project has no autoprefixer, so a prefix in the source is the
    // only prefix that reaches a browser. Safari has never shipped
    // `backdrop-filter` unprefixed, so the automatic fix would have shipped a
    // Safari regression — quietly, three lines under a comment saying that
    // exact line is load-bearing.
    //
    // `ignoreProperties` was tried first and does not reach it: the rule reads
    // the prefixed name, so naming the unprefixed one exempts nothing. Off
    // wholesale is also the honest setting — the rule's premise is false here
    // for every property, not just this one.
    "property-no-vendor-prefix": null,

    // **Off, because the chrome island makes it fire on rules that cannot
    // conflict.** `globals.css` declares the app's tokens for `:root` and for
    // `.aeleos-chrome` together, so a control keeps AeleOS's palette on a
    // document wearing an author's page. Three rules then match a chrome
    // island: the palette, the dark override
    // (`[data-theme="dark"] .aeleos-chrome`), and the mode-independent form
    // tokens a skin overrides — and the last is a bare class appearing after
    // the descendant selector, which is what this rule reports.
    //
    // It is a false positive, and the reason is that the rule compares
    // SELECTORS and cannot see property sets. The dark rule declares colour;
    // the form rule declares corner radius, border style and shadow. They
    // overlap in nothing, and where they ever did, specificity decides
    // regardless of source order — so there is no surprise override for the
    // ordering to prevent.
    //
    // The remedy it wants is moving the form block above the dark one, and
    // that block's own comment explains why it sits outside both mode blocks.
    // Reordering sixty lines of stylesheet to satisfy a check about a conflict
    // that does not exist is the tail wagging the dog. Same judgement, and the
    // same file, as `no-duplicate-selectors` above.
    "no-descending-specificity": null,

    // A prefixed property and its standard form are the same declaration said
    // twice on purpose: Safari has never shipped `backdrop-filter` unprefixed,
    // and dropping either line changes what one browser renders.
    "declaration-block-no-duplicate-properties": [
      true,
      { ignore: ["consecutive-duplicates-with-different-syntaxes"] },
    ],
  },
};
