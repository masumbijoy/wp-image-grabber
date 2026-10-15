# WP Image Grabber

Chrome extension (Manifest V3) that collects images from any WordPress site: shop categories (main photo taken from each product page), blog archives, galleries, or every image on a page. One image per item, duplicates removed, resized to a square WebP and saved to a folder or a .zip with a `_map.csv`.

## Install
1. `chrome://extensions` → turn on Developer mode → Load unpacked → choose this folder.
2. Open a WordPress page, click the icon (or Alt+Shift+G), Scan page, Download.

Optional "Allow other domains" (Options page) lets it read images hosted on a CDN that blocks cross-origin reads.

Current version: see `manifest.json` (1.4.0). `tests/` holds Playwright tests against mock WordPress sites.
