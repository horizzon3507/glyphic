# Changelog

We follow [Semantic Versioning](https://semver.org/) and [Keep a Changelog](https://keepachangelog.com/). Glyphic is a single Web surface.

<details>
<summary>To see more about versioning, expand this.</summary>

Every version string starts with `v` (required), e.g. `v0.1.0-stable`.

Here the installable surface is **Web** (`glyphic` at https://horizzon3507.github.io/glyphic/). Other apps swap in their own names the same way — e.g. **CLI**, **Desktop**, **GNOME** — whatever you actually ship.

| Part | What you install | Example |
| --- | --- | --- |
| **Web** | glyphic in the browser, PWA-style static build | `v0.1.0-stable` |

With one surface there is no `m` in the tag and no per-surface sections — just the version notes.

Each release heading is the version and date (`## v0.1.0-stable · 18/10/2026`); under it, a short summary ends with a plain sentence like: "This version was made for Web with a stable release channel on 18/10/2026 (v0.1.0-stable)."

### What the channel suffix means

| Suffix | In plain words |
| --- | --- |
| **-alpha** | Very early. Expect missing pieces and lots of bugs. |
| **-beta** | Mostly there, but still rough. Fine to try; not the "official" install. |
| **-stable** | Ready for daily use. This is what we put on GitHub Releases and the AUR. |

We only call something **stable** when we mean it.

</details>

## v0.1.4-stable · 23/10/2026

Studio cut: dither, one-click looks, a custom ink-ordered ramp, character aspect, and a source photo under the ASCII. This version was made for Web with a stable release channel on 23/10/2026 (v0.1.4-stable).

- Floyd-Steinberg and Atkinson dither. The glyph follows the diffused luminance, and color mode still paints each character from its source pixel.
- Five looks: Amber, Phosphor, Game Boy, Receipt, and Matrix. Each sets font, charset, colors, contrast, invert, dither, and aspect, and leaves the resolution alone.
- Custom ramp. Glyphs are ordered by measured ink in the current font, darkest first. An empty field keeps the selected character set.
- Aspect slider from 0.30 to 1.20, plus Match font. The default stays 0.50, so older pictures keep their row count.
- Drop an image anywhere on the window. Source lays the original photo under the ASCII, locked to pan and zoom. PNG, JPG, SVG, TXT, and HTML exports stay the artwork alone.
- Repaired the doubled v0.1.1 heading.

## v0.1.3-stable · 19/10/2026

Hosting-relief cut: one build now serves both deploy targets, and the terminal theme is whole again. This version was made for Web with a stable release channel on 19/10/2026 (v0.1.3-stable).

- Assets resolve from a relative base, so the worker deploy at the domain root and the GitHub Pages subpath both render from the same bundle.
- The dark class is back on the html root after the history rewrite silently threw the terminal into the light palette.
- Changelog blurb example restored; the 0.1.1 notes had been spliced into the example sentence.

## v0.1.1-stable · 18/10/2026

Tooling relief cut: the whole build pipeline now runs on Bun, from local installs to the Pages CI. This version was made for Web with a stable release channel on 18/10/2026 (v0.1.1-stable).

- Package manager switched from pnpm to Bun; the esbuild build-script allowlist and its bootstrap warnings go away with it.
- Pages deploy workflow installs with `bun install --frozen-lockfile` and builds with `bun run build`.
- Dev server pinned to port 5176 so the local URL survives the `/glyphic/` base path.
- Various other small tweaks

## v0.1.0-stable · 18/10/2026

First public cut of the image-to-ASCII studio: paste or pick an image, tune it on a CRT terminal panel and export in five formats. This version was made for Web with a stable release channel on 18/10/2026 (v0.1.0-stable).

- Image → ASCII conversion with true area-averaged downsampling, perceptual luminance, contrast, invert and alpha-safe transparency.
- Canvas viewport with cursor-anchored wheel zoom, drag pan and fit controls, rendered at device pixel ratio.
- Colors: HSV picker with HEX/HSL/RGB cycle, grayscale presets, custom text/background colors, and a color mode that paints each character from its source pixel.
- Export menu: supersampled PNG (exact artwork bounding box), JPG, vector SVG, TXT and standalone styled HTML, with an optional "current view" slice for rasters.
- Clipboard paste upload anywhere, plus last image and settings restored between reloads (IndexedDB + localStorage).
- Eight mono-friendly fonts and eleven character sets, all bundled locally — no CDN requests.
- Responsive layout with a mobile drawer sidebar, CRT scanlines and flicker, and square toasts.
- Various other UI polish
