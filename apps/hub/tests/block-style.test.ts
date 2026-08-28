import { describe, expect, it } from "vitest";
import { blockStyle } from "@/features/actors/presentation/block-style";
import { nestedSkinVars } from "@/shared/domain/skins";

// WHERE THIS CAME FROM, AND WHY IT IS DIRECT CALLS NOW.
//
// This suite was `describe("a section's own style")` inside
// `public-sections.test.tsx`, and half of it read the emitted properties back
// off a rendered `<section>`. That indirection bought nothing and hid one
// thing: jsdom's `CSSStyleDeclaration` silently drops a value it cannot parse
// on assignment, so a DOM-level assertion about a REFUSED background reads
// `""` whether or not the refusal exists — the test cannot go red on the
// unfixed code. Calling the function is the only place those cases can.
//
// The DOM-level half that is still worth having — that what this returns
// actually reaches the element a page renders, at every depth — lives in
// `blocks.test.tsx`, against the tree that puts it there.

describe("blockStyle", () => {
  // The unstyled case has to stay a genuine absence, not an empty object.
  // React's SSR serializer drops an empty `style={{}}` exactly as it drops no
  // `style` prop at all — `renderToStaticMarkup` emits identical markup for
  // both — so swapping the early return for `return {}` leaves every
  // DOM-level assertion in this repo green. This is the one place that
  // sabotage goes red.
  it("returns undefined, not an empty object, for a block with no style", () => {
    expect(blockStyle(undefined)).toBeUndefined();
  });

  // The other half of the same claim: a bag that is present but says nothing
  // is still nothing to override.
  it("returns undefined for an empty style bag", () => {
    expect(blockStyle({})).toBeUndefined();
  });

  // The resolved VALUE `--card-size` carries for each size, not merely that
  // some class exists mentioning one. **No renderer reads this today** — see
  // the constant's own doc — so this is what stops the three sizes quietly
  // becoming one number while nothing is looking at them.
  it.each([
    ["s", "12rem"],
    ["m", "16rem"],
    ["l", "20rem"],
  ] as const)("maps card_size %s to --card-size %s", (card_size, min) => {
    expect(blockStyle({ card_size })).toEqual({ "--card-size": min });
  });

  // No `card_size` chosen, but something else in the bag is — proves the key
  // is genuinely absent from what is emitted, rather than merely unobserved
  // because nothing else was set either.
  it("emits no --card-size when a style is chosen but card_size is not", () => {
    expect(blockStyle({ skin: "glass" })).not.toHaveProperty("--card-size");
  });

  // `border` becomes `--skin-border-style` verbatim, including `"none"` —
  // which is a CHOICE and is emitted exactly like any other member, never
  // treated as absence.
  it.each(["solid", "dashed", "dotted", "double", "none"] as const)(
    "maps border %s to --skin-border-style %s",
    (border) => {
      // Read through a string index because `CSSProperties` declares no custom
      // properties; the value is what matters, not the whole object, which the
      // floor tests below assert in full.
      expect(
        (blockStyle({ border }) as Record<string, string> | undefined)?.[
          "--skin-border-style"
        ],
      ).toBe(border);
    },
  );

  // The floor under the WIDTH, which is what makes each of those choices do
  // something on a skin too narrow to draw it. The numbers are measured — see
  // `BORDER_MIN_WIDTH`'s own doc and `border-style-cascade.spec.ts`, which
  // watches the pixels rather than the declaration.
  it.each([
    ["solid", "1px"],
    ["dashed", "1px"],
    ["dotted", "1px"],
    ["double", "3px"],
  ] as const)("floors border %s at %s", (border, floor) => {
    expect(blockStyle({ border })).toEqual({
      "--skin-border-style": border,
      "--skin-border-min": floor,
    });
  });

  // `none` paints nothing at any width, so a floor under it would be a width
  // with nothing to draw — and, worse, would widen the LAYOUT of every
  // surface inside a block whose author asked for no edge at all.
  it("puts no floor under a border of none", () => {
    expect(blockStyle({ border: "none" })).toEqual({
      "--skin-border-style": "none",
    });
  });

  // A style is chosen, but not `border` — proves the token is genuinely
  // absent from what is emitted, the same guarantee `card_size` gets above.
  //
  // **Deliberately no `skin` here.** Choosing a skin already puts
  // `--skin-border-style` in the returned object, through `nestedSkinVars`'s
  // own full property set — that is the enclosing skin's own reset, not this
  // key's doing, and asserting its absence against a skinned style would test
  // the wrong thing.
  it("emits no --skin-border-style when a style is chosen but border is not", () => {
    expect(blockStyle({ card_size: "m" })).not.toHaveProperty(
      "--skin-border-style",
    );
  });

  // Asserting the VALUES, not merely that something came back — a bag
  // emitting the wrong skin would pass a test that only checked for a
  // non-empty object.
  it("carries its chosen skin's own overrides", () => {
    const emitted = blockStyle({ skin: "neobrutalism" }) as Record<
      string,
      string
    >;
    expect(emitted["--skin-round"]).toBe("0");
    expect(emitted["--skin-border"]).toBe("3px");
  });

  // The regression this feature exists to fix, and it matters more under the
  // block model than it ever did on a flat page: a skin scope may sit inside
  // a skin scope inside a skin scope, so a skin has to carry the FULL
  // property set — defaults included — or a property `paper` does not mention
  // falls through to whatever ENCLOSES it rather than resetting to the
  // design's own default.
  //
  // Absolute rather than relative on the first three: the values are written
  // out, so a regression inside `nestedSkinVars` itself cannot move both sides
  // of the assertion together.
  it("emits a skin's complete property set, not its differences", () => {
    const emitted = blockStyle({ skin: "paper" }) as Record<string, string>;
    expect(emitted["--skin-round"]).toBe("0.4");
    expect(emitted["--skin-border"]).toBe("0px");
    expect(emitted["--skin-gloss"]).toBe("none");
    expect(emitted["--skin-font"]).toBe("var(--font-sans)");
    expect(emitted).toMatchObject(nestedSkinVars("paper"));
  });

  it("paints a background picture it was given", () => {
    expect(
      blockStyle({ background_url: "https://example.test/bg.png" }),
    ).toMatchObject({
      backgroundImage: 'url("https://example.test/bg.png")',
    });
  });

  it("tiles the background when told to", () => {
    expect(
      blockStyle({
        background_url: "https://example.test/bg.png",
        background_fit: "tile",
      }),
    ).toMatchObject({ backgroundRepeat: "repeat", backgroundSize: "auto" });
  });

  it("covers with the background when told to", () => {
    expect(
      blockStyle({
        background_url: "https://example.test/bg.png",
        background_fit: "cover",
      }),
    ).toMatchObject({ backgroundRepeat: "no-repeat", backgroundSize: "cover" });
  });

  // **The absent fit is a third paint, not the absence of one**, and this is
  // the assertion that says so. It used to emit neither property, and
  // `background-repeat`'s initial value is `repeat` — so "Default" and "Tile"
  // were one behaviour under two names while the option's own doc promised
  // "unrepeated". Measured in a real Chromium at the time: an 8px tile over a
  // 64x64 box darkened 2048 of 4096 pixels either way, against 32 for a
  // genuinely unrepeated copy.
  //
  // `background-size: auto` is emitted for the same reason one step further:
  // `@utility surface` declares `background-size: var(--skin-gloss-size)`, so
  // on the editor's face a picture with no explicit size took the SKIN's
  // texture tile — `comic` sets `6px 6px` — and previewed as a mosaic of a
  // picture the public page renders at natural size.
  it("neither tiles nor scales a background whose fit the author left unset", () => {
    expect(
      blockStyle({ background_url: "https://example.test/bg.png" }),
    ).toMatchObject({ backgroundRepeat: "no-repeat", backgroundSize: "auto" });
  });

  // A fit with no picture is not a paint instruction at all — there is
  // nothing to repeat or scale — so neither property is emitted. Without this
  // the three above would pass on an implementation that always emitted them.
  it("emits no repeat or size when there is no picture to paint", () => {
    expect(blockStyle({ background_fit: "tile" })).toBeUndefined();
  });

  // The same rule every other pasted address on this page follows: an address
  // `safeHttpUrl` refuses paints nothing, never something built from what was
  // typed. `javascript:` is refused for the same reason an anchor never
  // carries one unescaped.
  it("paints nothing when the address is not http(s)", () => {
    expect(
      blockStyle({ background_url: "javascript:alert(1)" }),
    ).toBeUndefined();
  });

  it("carries both a skin and a background at once", () => {
    const emitted = blockStyle({
      skin: "glass",
      background_url: "https://example.test/bg.png",
      background_fit: "cover",
    }) as Record<string, string>;
    expect(emitted["--skin-round"]).toBe("2");
    expect(emitted.backgroundImage).toBe('url("https://example.test/bg.png")');
  });

  it("refuses a background address whose host still carries a quote", () => {
    expect(
      blockStyle({ background_url: 'https://ex"ample.test/a.png' }),
    ).toBeUndefined();
  });

  // The sharper version of the same case: a skin chosen alongside the quoted
  // address proves the BACKGROUND is what gets refused, rather than merely
  // proving the whole bag came back empty.
  it("keeps its skin but paints no background when the host still carries a quote", () => {
    const emitted = blockStyle({
      skin: "glass",
      background_url: 'https://ex"ample.test/a.png',
    }) as Record<string, string>;
    expect(emitted["--skin-round"]).toBe("2");
    expect(emitted).not.toHaveProperty("backgroundImage");
  });
});

describe("chrome", () => {
  // **Absent is INHERITANCE and the two named values are CHOICES**, the same
  // three states `border` has. A block inside a `bare` section needs `card` to
  // get its own back, which is why this is not a boolean.
  it("emits nothing when the key is absent", () => {
    expect(blockStyle({ border: "solid" })).not.toHaveProperty("--block-pad");
  });

  // Each of the four is asserted rather than the object as a whole, because a
  // partial `bare` — the fill gone and the padding kept — is exactly the
  // half-done card this key exists to avoid, and an all-or-nothing comparison
  // would pass on three of the four.
  it("takes the fill, the edge, the shadow and the padding together", () => {
    const bare = blockStyle({ chrome: "bare" }) as Record<string, string>;
    expect(bare["--surface"]).toBe("transparent");
    expect(bare["--skin-border"]).toBe("0px");
    expect(bare["--skin-border-min"]).toBe("0px");
    expect(bare["--skin-shadow"]).toBe("none");
    expect(bare["--block-pad"]).toBe("0px");
  });

  it("puts the padding back for a block that asks for its card", () => {
    const card = blockStyle({ chrome: "card" }) as Record<string, string>;
    expect(card["--block-pad"]).toBe("1rem");
    expect(card).not.toHaveProperty("--surface");
  });

  // The discriminating pair: `border: "none"` was what an author had before
  // this key, and it is NOT the same state. If it were, the key would be
  // redundant and this whole change unjustified.
  it('is not what `border: "none"` already did', () => {
    const border = blockStyle({ border: "none" }) as Record<string, string>;
    expect(border["--skin-border-style"]).toBe("none");
    expect(border).not.toHaveProperty("--surface");
    expect(border).not.toHaveProperty("--block-pad");
  });
});

describe("text_align", () => {
  it("sets the edge the text is laid against", () => {
    expect(blockStyle({ text_align: "center" })).toMatchObject({
      textAlign: "center",
    });
  });

  it("emits nothing when the key is absent", () => {
    expect(blockStyle({ skin: "glass" })).not.toHaveProperty("textAlign");
  });
});

describe("image_fit", () => {
  // **A token rather than a class, because the `<img>` is inside a leaf this
  // bag never reaches.** The renderers ask for `object-(--img-fit)`, so what
  // is asserted here is the property they read.
  it("sets how a picture fills its box", () => {
    expect(blockStyle({ image_fit: "contain" })).toMatchObject({
      "--img-fit": "contain",
    });
  });

  // The discriminating half. Absent must emit NOTHING rather than `cover`:
  // the default lives at `:root`, so an inherited `contain` from an enclosing
  // section would be overwritten by every unstyled block beneath it.
  it("emits nothing when the key is absent", () => {
    expect(blockStyle({ skin: "glass" })).not.toHaveProperty("--img-fit");
  });
});

describe("radius", () => {
  // **The composition case, which is the whole reason this key exists.**
  // `comic` sets `--skin-round: 0`; asking the same block for `round` must
  // beat it, or the corner is still welded to the aesthetic. A fixture with no
  // skin could not tell that from a bag that simply emits the number.
  it("beats the skin its own block is wearing", () => {
    expect(blockStyle({ skin: "comic", radius: "round" })).toMatchObject({
      "--skin-round": "2.5",
    });
  });

  it("is a real zero for square, not a small number", () => {
    expect(blockStyle({ radius: "square" })).toMatchObject({
      "--skin-round": "0",
    });
  });

  // Absent is INHERITANCE, so a block inside a squared section stays square.
  it("emits nothing when the key is absent", () => {
    expect(blockStyle({ text_align: "center" })).not.toHaveProperty(
      "--skin-round",
    );
  });
});
