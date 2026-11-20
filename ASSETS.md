# Tourney Gate assets

The Home atlas feature uses only original SVG/CSS artwork. The repository retains one generated bitmap from the earlier home-page hero, which the Home feature no longer references. Additional generated variants from exploration are not included or referenced by the project.

## Hero illustration

- Project path: `static/images/joust-hero.png`
- Tool: built-in `image_gen.imagegen`; no CLI/API fallback.
- Generated November 20, 2026, Asia/Manila.
- Alt description: A mounted knight approaches a tournament beneath the castle at sunset.
- Final prompt:

> Use case: historical-scene. Asset type: cinematic wide hero artwork for Tourney Gate, an elegant medieval tournament ticketing website. Create an original painterly cinematic landscape in a widescreen 3:2 composition: a mounted knight in polished steel armor on a dark horse carrying a long lance, approaching a medieval jousting field, golden late-afternoon haze, castle towers and distant crowds, muted oxblood and blue pennant banners. Horse and knight occupy the right half, left half is atmospheric shadow and open field suitable for website text overlay. Warm antique gold highlights, deep forest charcoal shadows, tactile film-grain painting quality, grounded natural anatomy, sophisticated epic historical drama. No words, no typography, no logos, no watermark. No injury or violence, staged pageantry.

## Original vector and CSS elements

`templates/venue_art.html` contains the earlier original venue drawings. `templates/atlas_landmarks.html` develops these into colored SVG landmarks for Royal Lists, Iron Colosseum, King’s Green, and Great Hall. `templates/atlas_map.html` contains the original SVG terrain, river, bridge, forests, paths, and compass. No atlas artwork uses generated bitmaps or external assets.

The gate crest, swords, bow, goblet, shield, ticket, location, calendar, and other interface icons are inline SVG authored for this project. Heraldic rings, banners, animated card highlights, venue fields, seating, and the ticket wax seal are HTML/CSS. They do not rely on raster illustrations or third-party icon libraries.

The faire refinement recolors and sharpens these original SVG drawings into an illuminated-map style, adds cartographic corner ornament in SVG, and reuses the existing TG crest for transitions. No new bitmap assets or external artwork were added.

The storybook redraw adds venue-specific architecture, timber and stone details, pennants, tents, orchards, mixed tree symbols, riverbank reeds, and the stone bridge. Subtle SVG gradients share a consistent upper-left light direction; landmark definitions use per-venue ID prefixes and map definitions use `atlas-map-`. Fine and secondary detail groups simplify at phone widths.

`docs/atlas-artwork/` contains reproducible SVG illustration studies plus PNG review renders, created from these source templates by `scripts/export_atlas.py` and the bundled Sharp renderer. These files are review artifacts, not runtime website assets or browser screenshots. No AI images or third-party artwork were added.

## Fonts

Font binaries were obtained from Google Fonts, with upstream SIL Open Font License files from the official google/fonts repository:

- Cinzel: `https://github.com/google/fonts/tree/main/ofl/cinzel`
- Cormorant Garamond: `https://github.com/google/fonts/tree/main/ofl/cormorantgaramond`
- Manrope: `https://github.com/google/fonts/tree/main/ofl/manrope`

