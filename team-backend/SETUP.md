# Team board setup (about 5 minutes, once)

This makes the moodboard and the creator sheet shared: everyone who installs this build of Creator Scout sees the same brands, reels and creators, on any device, and anyone can add to it.

The data lives in a Google Sheet that you own. It becomes the team's live master list:
- **Records** tab: every creator and reel.
- **Brands** tab: logo, card colour and niches.
- **Settings** tab: the festive tags.

## 1. Create the sheet and paste the script
1. Create a new Google Sheet, for example "Creator Scout – Team board". Use the Google account that should own the data.
2. Go to **Extensions → Apps Script**.
3. Delete what's in the editor, and paste everything from `team-backend/Code.gs`.
4. At the top, change `TEAM_KEY` to a long random phrase (for example `yaas-scout-7f2k-91mx-board`). Keep it private.
5. Click **Save**.

## 2. Run setup once
1. In the function dropdown next to **Run**, pick `setup`, then click **Run**.
2. Google asks for permission to use Sheets and Drive. Allow it. Drive is where logos and thumbnails are stored.
3. The sheet now has three tabs: Records, Brands and Settings.

## 3. Deploy it as a web app
1. Click **Deploy → New deployment**.
2. Click the gear icon and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
4. Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

If your Google Workspace doesn't allow "Anyone":
- Choose **Anyone within YAAS** instead.
- Set `TEAM_DOMAIN_ONLY = true` in `config.js`.
- Everyone then needs to be signed in to Google with their YAAS account in Chrome.

## 4. Connect the extension
Open `config.js` in the extension folder and fill in:

```js
const TEAM_DB_URL = 'https://script.google.com/macros/s/…/exec';
const TEAM_KEY = 'the same phrase you set in Code.gs';
```

Then reload Creator Scout in `chrome://extensions`. The moodboard's top bar should say **Team board live**.

Anything you saved before connecting is uploaded automatically the first time.

## 5. Share it with the team
Send the extension folder (with your `config.js`) to the team. Each person installs it with **Load unpacked**. That's it: they see the same board.

## Updating the script later
Paste the new code, then go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The URL stays the same, so nobody has to change anything.

## Good to know
- The **Make.com master database still gets every save**, exactly as before.
- Images go to a Drive folder called "Creator Scout images", shared by link so the team can see them. If your Workspace blocks link sharing, small thumbnails are stored in the sheet instead.
- Anyone with the URL **and** the key can read and write. Treat the key like a password, and change it in both places if it ever leaks.
