# Creator Scout v4.16 🕵️‍♂️

Creator Scout is a Chrome extension for scouting Instagram and YouTube creators and their content. Everything you save stays inside the extension. You copy it into any Google Sheet when you want, it still syncs to the master database, and it lands on a moodboard grouped by brand and niche.

## ✨ Features
* **One click on a reel:** Open the popup on any Instagram reel, post, profile, or YouTube short, video or channel, and it captures the page straight away. You get the thumbnail, caption and stats, plus the creator's name, followers, tier and profile picture.
* **Two modes:**
  * **Regular mode** (how the popup opens): **Save to sheet** adds the creator to your sheet on this browser, ready to copy into Google Sheets. It doesn't touch the moodboard.
  * **Moodboard mode** (the switch at the top of the popup): the popup turns violet with a moving halo so it's obvious. Pick a brand, optionally a niche and campaign type (festivals like Diwali, seasons like Summer, sales, launches), and press **Add to moodboard**. The reel lands on that brand's moodboard for the whole team, and in your sheet.
  * Both modes still send every save to the Make.com master database.
* **Fast saves:** Saving is instant. The thumbnail and profile picture are copied as soon as the page is fetched, and moodboard saves upload to the team board in the background, so you can close the popup straight away.
* **Updates in one click:** When a newer version is on GitHub, the moodboard shows **Update to x**, the popup shows an update bar and the toolbar icon shows **NEW**. The first time, pick your Creator Scout folder and allow editing (choose **Allow on every visit** if Chrome offers it). After that, updates install by themselves whenever the moodboard or sheet opens, and Creator Scout restarts with all your data. You can turn automatic updates off on the update page. To check by hand any time, use **··· → Check for updates** on the moodboard, or click the version number at the bottom of the popup.
* **Brand (was IP):** Brand and IP are the same thing now. Old rows with an IP are moved to Brand automatically, and the Make.com payload still includes `ip` (a copy of brand) so the existing scenario keeps working.
* **Shared team board:** With the team database connected (see `team-backend/SETUP.md`), everyone using the extension sees and adds to the same board and sheet, on any device. Saves made while offline upload automatically later.
* **Moodboard dashboard:**
  * The home screen is a curved carousel with one card per brand, sized to fit on one screen. Each card glows in its own colours, taken automatically from its logo or reel cover, and the background glow follows the card in the middle.
  * Use **Edit card** to upload the brand's logo or any photo and pick a card colour, and **New brand** to add one. Size the image with the slider, + and −, or by scrolling on the card; drag it to move it; or use **Logo size**, **Whole image** and **Fill card**.
  * The carousel is a wheel that loops forever: scroll (trackpad or mouse wheel), drag with momentum, or use the arrow keys, and it glides and settles on a card. With only a few brands, the wheel repeats them so there's never an empty gap.
  * Open a brand and its logo sits next to its name as a rounded square icon (the initial on the card colour if there's no logo). Then there are two tabs:
    * **Reels**: a carousel or grid of its reels. The **Filters** menu next to Carousel / Grid filters by niche, campaign type and platform. Click a reel to play it embedded (Instagram or YouTube). The player panel shows the creator and stats, and that's where you change its brand, niche and campaign type or remove it. Use **+ Add links** to paste reel, post or video links (added with their creators) or creator profile links (added to the Creators tab). Pick campaign types in the same box to tag everything you add; click anywhere outside the box to fold it away. To tag a single reel later, open it: its niche and campaign types are in the panel beside the video.
    * **Creators**: everyone saved for that brand, with followers, tier, niches, reel count and who saved them. Hover a row and press × to remove a creator (and their reels) from the brand. Click a creator's Category, Type or Niche to change it from a dropdown (or type a new one). **Copy list for Sheets** copies the table.
  * Double-click a brand's title to rename it for everyone.
  * **Share with client:** inside a brand, this button in the top bar creates a private link to that brand's moodboard. The client sees the reels and creators the way you do, read-only, with no other brands and no teammates' names, and it stays up to date. You can turn the link off or replace it at any time. Setup: `team-backend/SETUP.md`, "Client links".
  * **Deleting:** hover a reel and press × (or **Delete this reel** in the player) and confirm. To delete a whole brand, open **Edit card → Delete brand** and type the brand's name to confirm, like deleting a GitHub repo.
* **Creator list (the sheet):** **Open sheet** in the popup opens every saved row, with Google Sheets-style tools:
  * **Each column heading:** click it to sort; use its ▾ menu to sort A→Z or Z→A, filter by values (and by a min/max range for number columns), hide the column or move it. You can also drag headings to reorder them.
  * **Columns panel:** show, hide and reorder columns.
  * **Rows:** tick checkboxes to hide rows or copy just those.
  * **Active-view bar:** a bar above the table shows the current sort, filters and hidden rows or columns, each with a one-click undo. Your view is remembered on that browser.
  * **Copy and export:** **Copy for Google Sheets**, **Copy new rows**, **Export Excel** and **Export CSV** use exactly what you see.
  * **Clear sheet:** empties the sheet on this extension only. Nothing is deleted from the team board, the moodboard or the master database. New scouts (and creators you scout again) appear as usual, and **Restore** brings the cleared rows back.
* **Master database:** Every save still goes to the Make.com master webhook.

## 📄 Sheet columns
`Date` | `Platform` | `Username` | `Name` | `Followers` | `Category` | `Tier` | `Type` | `Brand` | `URL` | `Avg Views (10)` | `Country` | `Content URL` | `Niche` | `Campaign Type` | `Content Views` | `Content Likes` | `Saved By`

## 🔌 Master webhook payload
Each save POSTs JSON to `MASTER_WEBHOOK_URL` (in `config.js`, same URL as before). It includes the original fields (`platform, username, name, followers, category, tier, type, ip, url, avgViews, country`), with `ip` now holding the brand. It also includes `brand, contentUrl, contentKind, thumbUrl, caption, contentViews, contentLikes, contentComments, postedAt, niche, festive` (comma-separated), `savedBy` and `savedAt`. Make.com ignores fields you haven't mapped, so the existing scenario keeps working.

## 🧩 Install
1. Fill in `config.js`. The team database URL and key come from `team-backend/SETUP.md`. Leave them empty to keep data on one browser.
2. Go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick this folder. Keep the folder where it is: updates are written into it.

## 🚀 Shipping an update to the team
1. Make your changes and raise `"version"` in `manifest.json` (for example 4.5 → 4.6). Without a higher version, nobody is offered the update.
2. Push to `main` on GitHub. Within about 15 minutes everyone sees the update, and anyone who has allowed their folder gets it automatically.

Updates come from `UPDATE_REPO` / `UPDATE_BRANCH` in `config.js`. The update never replaces a filled-in team database URL with a blank one, and it checks that the folder and the download are both Creator Scout before writing anything.

## 🗂 Files
| File | What it does |
|---|---|
| `popup.html / popup.js / popup.css` | The popup: fetch, tag and save |
| `sheet.html / sheet.js / sheet.css` | Creator list: the built-in sheet with copy and export |
| `scraper.js` | Injected into Instagram to read profiles, reels and posts |
| `config.js` | Master webhook, YouTube key, team database and update settings |
| `updater.js / update.html / update.js / update.css` | Update checks and the one-click update page |
| `share.js` | Lets `moodboard.html` run on the web as the read-only client view |
| `background.js` | Uploads moodboard saves, marks the icon when an update is ready, reopens tabs after an update |
| `db.js` | Storage, team sync, sheet export and number helpers |
| `platforms.js` | Instagram and YouTube lookups shared by the popup and dashboard |
| `team-backend/` | Apps Script for the shared team database, and its setup guide |
| `moodboard.html / moodboard.js / moodboard.css` | The moodboard dashboard |
| `icons/` | The Flash logo (`logo.svg`) and extension icon (16, 32, 48, 128 px) |
| `fonts/` | Bundled Scout Pixel (headline font made for this extension) and Inter (SIL Open Font License) |

Each browser keeps a local copy, so pages open instantly and work offline. The team database is the shared source of truth. Thumbnails are saved as small copies, so they don't break when Instagram's image links expire.
