# Tourney Gate assets

The website includes one generated bitmap, used only for the home-page hero. Additional generated variants from exploration are not included or referenced by the project.

## Hero illustration

- Project path: `static/images/joust-hero.png`
- Tool: built-in `image_gen.imagegen`; no CLI/API fallback.
- Generated November 20, 2026, Asia/Manila.
- Alt description: A mounted knight approaches a tournament beneath the castle at sunset.
- Final prompt:

> Use case: historical-scene. Asset type: cinematic wide hero artwork for Tourney Gate, an elegant medieval tournament ticketing website. Create an original painterly cinematic landscape in a widescreen 3:2 composition: a mounted knight in polished steel armor on a dark horse carrying a long lance, approaching a medieval jousting field, golden late-afternoon haze, castle towers and distant crowds, muted oxblood and blue pennant banners. Horse and knight occupy the right half, left half is atmospheric shadow and open field suitable for website text overlay. Warm antique gold highlights, deep forest charcoal shadows, tactile film-grain painting quality, grounded natural anatomy, sophisticated epic historical drama. No words, no typography, no logos, no watermark. No injury or violence, staged pageantry.

## Original vector and CSS elements

`templates/venue_art.html` contains the original venue drawings used in catalogue cards and event headers. These are code-authored SVG architectural sketches of the stands, arena, archery field, and banquet tables, with no generated bitmap assets.

The gate crest, swords, bow, goblet, shield, ticket, location, calendar, and other interface icons are inline SVG authored for this project. Heraldic rings, banners, animated card highlights, venue fields, seating, and the ticket wax seal are HTML/CSS. They do not rely on raster illustrations or third-party icon libraries.

## Fonts

Font binaries were obtained from Google Fonts, with upstream SIL Open Font License files from the official google/fonts repository:

- Cinzel: `https://github.com/google/fonts/tree/main/ofl/cinzel`
- Cormorant Garamond: `https://github.com/google/fonts/tree/main/ofl/cormorantgaramond`
- Manrope: `https://github.com/google/fonts/tree/main/ofl/manrope`

