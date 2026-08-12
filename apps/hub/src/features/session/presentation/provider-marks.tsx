/**
 * Brand marks for the social providers, as inline SVG.
 *
 * Inline rather than an icon font, and inline rather than remote images: a
 * placeholder glyph once shipped as a tofu box because no loaded font carried
 * it, and the design rule since then is that anything decorative is an SVG or a
 * real element. Inlining also means no extra request and no flash of a missing
 * logo on the one page that has to look trustworthy.
 *
 * Each mark is `aria-hidden`: the button around it carries the accessible name,
 * so announcing the logo as well would read the provider twice.
 */

/** Shared attributes so every mark sits identically inside its button. */
const MARK = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  focusable: false,
} as const;

/**
 * Discord's mark, in its brand blurple.
 *
 * A brand colour rather than `currentColor`, to match Google's and Facebook's:
 * one monochrome logo among two coloured ones reads as a rendering fault.
 *
 * @returns the logo.
 */
export function DiscordMark() {
  return (
    <svg {...MARK} fill="#5865F2">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 15.432 3a13.9 13.9 0 0 0-.63 1.28 18.27 18.27 0 0 0-5.605 0A13.7 13.7 0 0 0 8.56 3a19.74 19.74 0 0 0-4.886 1.372C.567 8.98-.28 13.475.145 17.9a19.9 19.9 0 0 0 6.002 3.03 14.6 14.6 0 0 0 1.286-2.081 13 13 0 0 1-2.024-.968c.17-.123.336-.25.496-.38a14.2 14.2 0 0 0 12.19 0c.162.13.328.257.497.38a13 13 0 0 1-2.028.97 14.4 14.4 0 0 0 1.286 2.08 19.9 19.9 0 0 0 6.005-3.03c.5-5.177-.838-9.63-3.538-13.532M8.02 15.278c-1.182 0-2.157-1.077-2.157-2.398s.955-2.4 2.157-2.4 2.176 1.078 2.156 2.4c0 1.32-.955 2.398-2.156 2.398m7.975 0c-1.183 0-2.157-1.077-2.157-2.398s.955-2.4 2.157-2.4 2.176 1.078 2.156 2.4c0 1.32-.955 2.398-2.156 2.398" />
    </svg>
  );
}

/**
 * Google's mark, in its four brand colours.
 *
 * @returns the logo.
 */
export function GoogleMark() {
  return (
    <svg {...MARK}>
      <path
        fill="#4285F4"
        d="M23.52 12.273c0-.851-.076-1.67-.218-2.455H12v4.642h6.458a5.52 5.52 0 0 1-2.394 3.622v3.01h3.878c2.269-2.088 3.578-5.163 3.578-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.956-1.075 7.942-2.908l-3.878-3.01c-1.075.72-2.45 1.145-4.064 1.145-3.125 0-5.77-2.11-6.715-4.947H1.276v3.109A11.995 11.995 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.285 14.28A7.2 7.2 0 0 1 4.909 12c0-.79.136-1.558.376-2.28V6.611H1.276A11.99 11.99 0 0 0 0 12c0 1.936.464 3.769 1.276 5.389z"
      />
      <path
        fill="#EA4335"
        d="M12 4.773c1.762 0 3.344.605 4.588 1.794l3.442-3.442C17.951 1.19 15.235 0 12 0A11.995 11.995 0 0 0 1.276 6.611l4.009 3.109C6.23 6.883 8.875 4.773 12 4.773z"
      />
    </svg>
  );
}

/**
 * Facebook's mark.
 *
 * @returns the logo.
 */
export function FacebookMark() {
  return (
    <svg {...MARK} fill="#1877F2">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.412c0-3.026 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.956.93-1.956 1.886v2.265h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073" />
    </svg>
  );
}
