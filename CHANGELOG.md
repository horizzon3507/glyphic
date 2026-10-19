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
