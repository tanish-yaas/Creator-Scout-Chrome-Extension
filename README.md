# Creator Scout v2.0 🕵️‍♂️

Creator Scout is a custom Chrome Extension designed to instantly scout, scrape, and securely log creator profile data from Instagram and YouTube directly into a Master Google Sheet and company-wide database. 

## ✨ Features
* **Dual-Platform Architecture:** Seamlessly toggle between Instagram and YouTube scouting modes.
* **Instagram Visual Scraper:** Automatically reads and extracts public DOM stats (Name, Handle, Followers, Category) without requiring API keys.
* **YouTube API Integration:** Auto-detects channel URLs and queries the YouTube Data API v3 to pull exact Subscribers, Country, and dynamically calculates the **Average Views of the last 10 videos**.
* **Automated Tier Classification:** Instantly categorizes creators (Nano, Micro, Mid-Tier, Macro, Mega) based on real-time audience size.
* **Dual-Write Pipeline:** Pushes data directly to a personal Google Sheet via Apps Script, while simultaneously firing a silent webhook to Make.com for Master Database mapping.

---

## 🛠️ Database Setup

### 1. Google Sheets Column Schema
Your target Google Sheet must have the following 12 columns in Row 1 exactly as written:
`Date` | `Platform` | `Username` | `Name` | `Followers` | `Category` | `Tier` | `Type` | `IP` | `URL` | `Avg Views (10)` | `Country`

### 2. Google Apps Script Backend
To accept data from the extension, attach this script to your Google Sheet:
1. Open your Google Sheet and go to **Extensions > Apps Script**.
2. Paste the code below.
3. Click **Deploy > New deployment**, set access to **Anyone**, and copy the **Web App URL**.

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    sheet.appendRow([
      new Date(),
      data.platform || "Instagram", 
      data.username || "--", 
      data.name || "--", 
      data.followers || 0, 
      data.category || "--", 
      data.tier || "--",
      data.type || "--",        
      data.ip || "--",          
      data.url || "--",
      data.avgViews || "--",       
      data.country || "--"      
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({"status": "Success"}))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "Error", "message": error.message}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
