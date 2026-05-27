# Creator Scout 🕵️‍♂️ (v1.2)

A production-grade, minimalist Chrome Extension designed for influencer marketing. Creator Scout instantly scrapes public Instagram profile data and sends it directly to your private Google Sheet database.

## ✨ Core Features
* **Intelligent Visual Scraping:** Scrapes data by reading the visual hierarchy of the page rather than relying on unstable HTML tags. Accurately captures Name, Handle, Followers, and Category.
* **Influencer Tiering:** Automatically calculates and tags the creator's tier (Nano, Micro, Mid-Tier, Macro, Mega) with glowing UI pills.
* **Searchable IP History:** The IP field supports a searchable dropdown history that persists your previously entered IPs for rapid data entry.
* **Flexible Categorization:** Built-in dropdown with common niches, plus an "Others" option that allows for custom free-text input.
* **Data Integrity:** Scrapes human-readable formats (e.g., "17.6K") but pushes clean, raw integers (e.g., "17600") to your Google Sheet for easy sorting and analysis.
* **Minimalist Dashboard:** A high-contrast, dark-themed interface built for speed and zero-scroll usability.

---

## 🚀 Installation (How to install on your device)

1. **Download the Code:**
   * Download the repository as a `.zip` file and extract it to a folder named `creator-scout`.
2. **Open Chrome Extensions:**
   * Open Chrome and navigate to `chrome://extensions/`.
3. **Enable Developer Mode:**
   * Toggle the **Developer mode** switch in the top right corner to ON.
4. **Load the Extension:**
   * Click the **Load unpacked** button in the top left.
5. **Select the Folder:**
   * Select the unzipped `creator-scout` folder on your computer.

---

## 🗄️ Database Setup (Apps Script)

1. Create a new [Google Sheet](https://sheets.new).
2. Set up headers in **Columns A through I**:
   `Date` | `Username` | `Name` | `Followers` | `Category` | `Tier` | `Type` | `IP` | `URL`
3. Click **Extensions > Apps Script**.
4. Paste the following JavaScript:

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
      data.type,        
      data.ip,          
      data.url
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({"status": "Success"}))
                         .setMimeType(ContentService.MimeType.JSON);
                         
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "Error", "message": error.message}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
