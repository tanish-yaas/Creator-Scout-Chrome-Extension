# Creator Scout v4.2 🕵️‍♂️

Creator Scout is a Chrome extension for scouting Instagram and YouTube creators and their content. Everything you save stays inside the extension. You copy it into any Google Sheet when you want, it still syncs to the master database, and it lands on a moodboard grouped by brand and niche.

## ✨ Features
* **One click on a reel:** Open the popup on any Instagram reel, post, profile, or YouTube short, video or channel, and it captures the page straight away. You get the thumbnail, caption and stats, plus the creator's name, followers, tier and profile picture. Pick a brand (it remembers your last one), optionally a niche and festive tags, and press **Save to moodboard**. The reel lands on that brand's moodboard and the creator is added to the sheet.
* **Brand (was IP):** Brand and IP are the same thing now. Old rows with an IP are moved to Brand automatically, and the Make.com payload still includes `ip` (a copy of brand) so the existing scenario keeps working.
* **Shared team board:** With the team database connected (see `team-backend/SETUP.md`), everyone using the extension sees and adds to the same board and sheet, on any device. Saves made while offline upload automatically later.
* **Moodboard dashboard:**
  * The home screen is a curved carousel with one card per brand, sized to fit on one screen. Each card glows in its own colours, taken automatically from its logo or reel cover, and the background glow follows the card in the middle.
  * Use **Edit card** to upload the brand's logo and pick a card colour, and **New brand** to add one.
  * Drag, swipe, use the arrow keys, or scroll sideways (trackpad or Shift + wheel) to move the carousel.
  * Open a brand to get two tabs:
    * **Reels**: a carousel or grid of its reels, with niche and festive filters. Click a reel to play it embedded (Instagram or YouTube). The player panel shows the creator and stats, and that's where you change its brand, niche and festive tags or remove it. Use **+ Add reel links** to paste reference links; they're looked up and added with their creators.
    * **Creators**: everyone saved for that brand, with followers, tier, niches, reel count and who saved them. **Copy list for Sheets** copies the table.
  * Double-click a brand's title to rename it for everyone.
  * **Deleting:** hover a reel and press × (or **Delete this reel** in the player) and confirm. To delete a whole brand, open **Edit card → Delete brand** and type the brand's name to confirm, like deleting a GitHub repo.
  * **Sample board:** **Load sample board** fills the board with four brands and nine real public reels for testing. It looks them up with your Instagram login so the cards get real covers. **Remove sample board** takes them all out again.
* **Creator list (the sheet):** **Open sheet** in the popup opens every saved row, with Google Sheets-style tools:
  * **Each column heading:** click it to sort; use its ▾ menu to sort A→Z or Z→A, filter by values (and by a min/max range for number columns), hide the column or move it. You can also drag headings to reorder them.
  * **Columns panel:** show, hide and reorder columns.
  * **Rows:** tick checkboxes to hide rows or copy just those.
  * **Active-view bar:** a bar above the table shows the current sort, filters and hidden rows or columns, each with a one-click undo. Your view is remembered on that browser.
  * **Copy and export:** **Copy for Google Sheets**, **Copy new rows**, **Export Excel** and **Export CSV** use exactly what you see.
  * **Clear sheet:** empties the sheet on this extension only. Nothing is deleted from the team board, the moodboard or the master database. New scouts (and creators you scout again) appear as usual, and **Restore** brings the cleared rows back.
* **Master database:** Every save still goes to the Make.com master webhook.

## 📄 Sheet columns
`Date` | `Platform` | `Username` | `Name` | `Followers` | `Category` | `Tier` | `Type` | `Brand` | `URL` | `Avg Views (10)` | `Country` | `Content URL` | `Niche` | `Festive Tags` | `Content Views` | `Content Likes` | `Saved By`

## 🔌 Master webhook payload
Each save POSTs JSON to `MASTER_WEBHOOK_URL` (in `config.js`, same URL as before). It includes the original fields (`platform, username, name, followers, category, tier, type, ip, url, avgViews, country`), with `ip` now holding the brand. It also includes `brand, contentUrl, contentKind, thumbUrl, caption, contentViews, contentLikes, contentComments, postedAt, niche, festive` (comma-separated), `savedBy` and `savedAt`. Make.com ignores fields you haven't mapped, so the existing scenario keeps working.

## 🧩 Install
1. Fill in `config.js`. The team database URL and key come from `team-backend/SETUP.md`. Leave them empty to keep data on one browser.
2. Go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick this folder.

## 🗂 Files
| File | What it does |
|---|---|
| `popup.html / popup.js / popup.css` | The popup: fetch, tag and save |
| `sheet.html / sheet.js / sheet.css` | Creator list: the built-in sheet with copy and export |
| `scraper.js` | Injected into Instagram to read profiles, reels and posts |
| `config.js` | Master webhook, YouTube key and team database settings |
| `db.js` | Storage, team sync, sheet export and number helpers |
| `platforms.js` | Instagram and YouTube lookups shared by the popup and dashboard |
| `team-backend/` | Apps Script for the shared team database, and its setup guide |
| `moodboard.html / moodboard.js / moodboard.css` | The moodboard dashboard |
| `icons/` | Extension icon (16, 32, 48, 128 px) |
| `fonts/` | Bundled Scout Pixel (headline font made for this extension) and Inter (SIL Open Font License) |

Each browser keeps a local copy, so pages open instantly and work offline. The team database is the shared source of truth. Thumbnails are saved as small copies, so they don't break when Instagram's image links expire.
