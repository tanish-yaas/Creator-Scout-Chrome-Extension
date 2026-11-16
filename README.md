# Creator Scout v3.0 🕵️‍♂️

Creator Scout is a Chrome extension for scouting Instagram and YouTube creators and their content. Everything you save stays inside the extension. You copy it into any Google Sheet when you want, it still syncs to the master database, and it lands on a moodboard grouped by brand and niche.

## ✨ Features
* **Profiles and content:** Works on Instagram profiles, reels and posts, and YouTube channels, shorts and videos. The platform is picked automatically from the open tab.
* **Instagram scraper:** Reads name, handle, followers and category from profiles. On reels and posts it also reads the thumbnail, caption, likes and comments, then looks up the creator's follower count.
* **YouTube API:** Subscribers, country and the **average views of the last 10 videos**. On a short or video it also gets that video's views, likes and thumbnail.
* **Tier classification:** Nano, Micro, Mid-Tier, Macro or Mega.
* **Built-in sheet (no Apps Script needed):** Saved rows live in the extension. On the **Saved** tab:
  * **Copy new rows** copies only the rows you haven't copied yet. Paste them under your last row in any Google Sheet with Ctrl/⌘ + V.
  * **Copy all + headers** copies every row with headers for a fresh sheet (paste into A1).
  * **Download CSV** gives you a file to import or send.
  * **Open a new Google Sheet** opens sheets.new.
* **Master database:** Every save is also sent to the Make.com master webhook, the same as before.
* **Moodboard:** Click **Moodboard ↗** in the popup. Scouted reels and videos are pinned by **brand → niche**, with **festive tags** (Diwali, Holi, Navratri, Eid, Christmas and more, plus your own). You can:
  * filter by festive tag, platform or search
  * drag frames between brands and niches
  * rename brands and niches with a double-click
  * edit tags in the side panel
  * copy the links in the current view for a client deck

  It updates live while you scout.

## 📄 Sheet columns
The first 12 match the old Apps Script sheet, so existing sheets keep lining up:

`Date` | `Platform` | `Username` | `Name` | `Followers` | `Category` | `Tier` | `Type` | `IP` | `URL` | `Avg Views (10)` | `Country` | `Content URL` | `Brand` | `Niche` | `Festive Tags` | `Content Views` | `Content Likes`

## 🔌 Master webhook payload
Each save POSTs JSON to `MASTER_WEBHOOK_URL` with the original fields (`platform, username, name, followers, category, tier, type, ip, url, avgViews, country`) plus `contentUrl, contentKind, thumbUrl, caption, contentViews, contentLikes, contentComments, postedAt, brand, niche, festive` (comma-separated) and `savedAt`. Make.com ignores fields you don't map, so the existing scenario keeps working. Map the new ones whenever you need them.

## 🧩 Install
1. Go to `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.

## 🗂 Files
| File | What it does |
|---|---|
| `popup.html / popup.js / popup.css` | Scout and Saved tabs |
| `scraper.js` | Injected into Instagram to read profiles, reels and posts |
| `db.js` | Shared storage, sheet export and number helpers |
| `moodboard.html / moodboard.js / moodboard.css` | The moodboard dashboard |

Data is stored in `chrome.storage.local` on this browser. Thumbnails are saved as small copies, so they don't break when Instagram's image links expire.
