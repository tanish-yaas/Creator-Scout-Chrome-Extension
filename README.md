# Creator-Scout-Chrome-Extension# Creator Scout 🕵️‍♂️

A production-grade, minimalist Chrome Extension designed for influencer marketing. Creator Scout instantly scrapes public Instagram profile data and sends it directly to a private Google Sheet database with a single click.

## ✨ Features
* **Smart Visual Scraping:** Bypasses Instagram's hidden DOM tricks by reading the visual text hierarchy to accurately capture the Creator's Name, Handle, Follower Count, and Professional Category.
* **Auto-Tier Calculation:** Automatically calculates the influencer tier based on follower count (Nano, Micro, Mid-Tier, Macro, Mega) and applies a color-coded UI tag.
* **Direct Google Sheets Integration:** Pushes data directly to a personal Google Sheet via a custom Google Apps Script Web App.
* **Premium Minimalist UI:** A sleek, high-contrast dark mode interface inspired by modern AI tools.
* **Privacy First:** 100% local scraping. No external APIs, no third-party servers, and no user data collection. Data goes straight from your browser to your database.

---

## 🚀 Installation (How to install on your device)

Since this is a custom, private tool, you will install it using Chrome's Developer Mode.

1. **Download the Code:**
   * Clone this repository or download it as a `.zip` file and extract it.
2. **Open Chrome Extensions:**
   * Open Google Chrome and navigate to `chrome://extensions/` (or click the puzzle piece icon > Manage extensions).
3. **Enable Developer Mode:**
   * Toggle the **Developer mode** switch in the top right corner to ON.
4. **Load the Extension:**
   * Click the **Load unpacked** button in the top left.
5. **Select the Folder:**
   * Select the unzipped `creator-scout` folder on your computer.
6. **Pin it:** * Click the puzzle piece in your Chrome toolbar and pin Creator Scout for easy access.

---

## 🗄️ Backend Setup (The Google Apps Script)

To make the extension work, you need a database. We use a Google Sheet combined with Google Apps Script to catch the data.

1. Create a new [Google Sheet](https://sheets.new).
2. In the top row, add these headers in columns A through G: 
   `Date` | `Username` | `Name` | `Followers` | `Category` | `Tier` | `URL`
3. In the top menu, click **Extensions > Apps Script**.
4. Delete any existing code and paste the following JavaScript into the editor:

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    sheet.appendRow([
      new Date(),       
      data.username, 
      data.name, 
      data.followers, 
      data.category, 
      data.tier,        
      data.url
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({"status": "Success"}))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "Error", "message": error.message}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

🎯 How to Use
Open a creator's profile on Instagram (Web).

Click the Creator Scout icon in your Chrome toolbar.

Paste the Google Apps Script Web App URL you generated above into the Database Endpoint input and click Save. (You only need to do this once).

Click Fetch Profile Data. The extension will scrape the page and display a preview of the data and their Influencer Tier.

Click Push to Sheet.

Check your Google Sheet—the creator's data is now safely logged in a new row!

📂 File Structure
manifest.json: Extension configuration and permissions.

popup.html: The minimalist UI structure.

popup.css: High-end dark theme styling and glowing tier tags.

popup.js: The extension's logic, math calculations, and API POST requests.

content.js: The scraper script that reads the Instagram DOM visually to extract accurate data.

⚠️ Important Notes
Ensure your Chrome language is set to English for the DOM text scraper to accurately identify keywords like "followers".

Do not close the extension popup while it says "Pushing...".
