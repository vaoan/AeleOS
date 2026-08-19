import { expect, test } from "@playwright/test";

import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";

// WHY THIS FILE EXISTS.
//
// Pause did not pause. The chrome was handed `autoPlay={playing}` and nothing
// else — and `autoplay` is a LOAD-TIME attribute, so flipping it to false after
// playback has begun does nothing whatever. Pressing pause swapped the icon to
// a play triangle while the music carried on: a control that accepts a choice,
// looks like it worked, and changes nothing.
//
// **The unit suite could not have caught it and still cannot.** jsdom
// implements neither `play` nor `pause` — both throw "Not implemented" — so a
// jsdom test can only ever assert that the hook CALLED them, which is a
// statement about our code rather than about the audio. The whole distance
// between "we called pause" and "the sound stopped" is exactly where this bug
// lived.
//
// So the guard is here, and it reads the ELEMENT's own `paused` property, which
// only a browser with a media engine maintains.
//
// **The audio is served by the test, not fetched.** A real remote track would
// make this depend on somebody else's host being up, and this repository has
// zero tolerance for a flaky check. `page.route` fulfils the request with a few
// bytes of silent WAV, so the element has something genuinely playable and
// nothing leaves the machine. The address is `https:` because `media-src`
// allows `'self' https:` and a `data:` URI would be refused by the policy — a
// detail worth knowing before anybody "simplifies" this.

/**
 * Half a minute of silence, as a valid 8-bit mono WAV.
 *
 * **The LENGTH is load-bearing and was got wrong first.** At one second the
 * track ended during the poll, so `paused` went true on its own — and the stop
 * case passed with `audio.pause()` deleted from the source, for a reason
 * entirely unrelated to what it asserts. Long enough that nothing can finish
 * while a case is running is what makes these cases discriminate at all.
 */
function silentWav(): Buffer {
  const samples = 8000 * 30;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(8000, 24); // sample rate
  header.writeUInt32LE(8000, 28); // byte rate
  header.writeUInt16LE(1, 32); // block align
  header.writeUInt16LE(8, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(samples, 40);
  // 0x80 is silence for unsigned 8-bit PCM.
  return Buffer.concat([header, Buffer.alloc(samples, 0x80)]);
}

const TRACK = "https://audio.test/silence.wav";

test.describe("a retro player", () => {
  let identity: TestIdentity | undefined;

  test.beforeAll(async () => {
    test.skip(!hasClerk(), "needs Clerk credentials");
    identity = await createTestIdentity();
  });

  test.afterAll(async () => {
    if (identity) await deleteTestIdentity(identity.userId);
  });

  test("stops the sound when pause is pressed, not merely the icon", async ({
    page,
  }) => {
    const who = identity;
    test.skip(!who, "needs Clerk credentials");
    if (!who) return;

    const { address, handle } = await seedPage({
      userId: who.userId,
      handlePrefix: "pause",
      displayName: "Pause",
      blocks: [
        container({
          name_en: "Music",
          mode: "stack",
          children: [
            leaf({
              kind: "jukebox",
              title_en: "A player",
              icon: "wmp64",
              rows: [[{ text_en: TRACK }, { text_en: "Silence" }]],
            }),
          ],
        }),
      ],
    });

    await page.route(TRACK, (route) =>
      route.fulfill({ contentType: "audio/wav", body: silentWav() }),
    );

    await page.goto(`/en/${address}/${handle}`);

    const media = page.locator("audio");
    await expect(media).toHaveCount(1);

    // Nothing has been asked for yet, so nothing is playing. Asserted first so
    // the transition below is a CHANGE rather than a state that was always
    // true — the vacuity trap this repository has sprung on itself before.
    expect(await media.evaluate((one: HTMLMediaElement) => one.paused)).toBe(
      true,
    );

    await page.getByTestId("player-toggle").click();
    await expect
      .poll(async () => media.evaluate((one: HTMLMediaElement) => one.paused))
      .toBe(false);

    await page.getByTestId("player-toggle").click();
    await expect
      .poll(async () => media.evaluate((one: HTMLMediaElement) => one.paused))
      .toBe(true);

    // The SAME control, because play and pause are one button whose label
    // toggles — a test id that changed with state would make this depend on the
    // very label the rule says not to couple to.
    //
    // And it resumes, so the fix is not simply "always paused".
    await page.getByTestId("player-toggle").click();
    await expect
      .poll(async () => media.evaluate((one: HTMLMediaElement) => one.paused))
      .toBe(false);
  });

  test("stops and rewinds when stop is pressed", async ({ page }) => {
    const who = identity;
    test.skip(!who, "needs Clerk credentials");
    if (!who) return;

    const { address, handle } = await seedPage({
      userId: who.userId,
      handlePrefix: "stop",
      displayName: "Stop",
      blocks: [
        container({
          name_en: "Music",
          mode: "stack",
          children: [
            leaf({
              kind: "jukebox",
              title_en: "A player",
              icon: "wmp64",
              rows: [[{ text_en: TRACK }, { text_en: "Silence" }]],
            }),
          ],
        }),
      ],
    });

    await page.route(TRACK, (route) =>
      route.fulfill({ contentType: "audio/wav", body: silentWav() }),
    );

    await page.goto(`/en/${address}/${handle}`);
    const media = page.locator("audio");

    await page.getByTestId("player-toggle").click();
    await expect
      .poll(async () => media.evaluate((one: HTMLMediaElement) => one.paused))
      .toBe(false);

    await page.getByTestId("player-stop").click();
    await expect
      .poll(async () => media.evaluate((one: HTMLMediaElement) => one.paused))
      .toBe(true);
    expect(
      await media.evaluate((one: HTMLMediaElement) => one.currentTime),
    ).toBe(0);
  });
});
