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

    // A prefixed property and its standard form are the same declaration said
    // twice on purpose: Safari has never shipped `backdrop-filter` unprefixed,
    // and dropping either line changes what one browser renders.
    "declaration-block-no-duplicate-properties": [
      true,
      { ignore: ["consecutive-duplicates-with-different-syntaxes"] },
    ],
  },
};
