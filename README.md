# Creator Scout 🕵️‍♂️ (v1.2)

A production-grade, minimalist Chrome Extension designed for influencer marketing. Creator Scout instantly scrapes public Instagram profile data and sends it directly to your private Google Sheet database with zero friction.

---

## ⚙️ System Architecture & Deep Dive

Creator Scout v1.2 runs on a highly efficient, sandboxed event-driven architecture split across four distinct, decoupled operational layers:

[ Instagram Webpage ]
▲   │
│   │ (1) Injected script processes text lines visually
│   ▼
[ content.js ] ──(2) chrome.runtime Message Handshake──► [ popup.js ] ◄──► [ Chrome Storage ]
│             (Local Config/IP Cache)
│ (3) Encrypted Fetch API (HTTP POST)
▼
[ Google Apps Script Cloud ]
│
▼
[ Your Google Sheet Ledger ]


### 1. The Configuration & Persistence Layer (`chrome.storage.sync`)
* **Instant State Hydration:** When the popup window is initialized, it immediately fires an asynchronous `GET` handshake to Chrome's local sandboxed memory storage. It retrieves the saved Web App Endpoint URL, your last selected Type configuration, and your custom IP histories so the UI is ready instantly without manual setup.
* **Reactive Cache Updates:** Event listeners are actively bound to the input elements. The millisecond you change an input character, choose a dropdown option, or type a custom text category under "Others", a background write operation securely persists those fields.

### 2. The Isolated Scraper Subsystem (`content.js`)
* **Visual Line Traversal Engine:** To guard against Instagram's obfuscated, dynamic class structures that break classic ID-based tools, this script handles pages purely via structural text hierarchies. It drops directly into the tab's DOM context, reads the container's raw `innerText`, and maps lines split by structural line breaks (`\n`).
* **Contextual Parsing Logic:** The script searches out reliable text anchors like the word `"followers"`. Once located, it traverses upwards mathematically through the array index map to capture the exact profile name line sitting straight above it. It gracefully ignores peripheral elements like "Verified" badges via custom exclusion checks.

### 3. The Central Logic & Processing Brain (`popup.js`)
* **Mathematical Data Normalization:** Web-scraped elements often come in messy formats (e.g., `"364K"`, `"1.2M"`, `"1,050"`). The built-in math engine identifies standard human-readable suffixes, slices them off, and runs a calculation script to translate them into clean, indexable base integer values (`364000`) for the database payload.
* **Tier Categorization Machine:** The normalized integer is evaluated sequentially against strict bracket constants via algorithmic comparison states, instantly determining and styling the creator’s specific profile indicator tier (Nano, Micro, Macro, etc.).
* **Searchable IP Combobox Engine:** When you select the IP input field, a custom rendering engine maps your unique stored histories into a localized overlay list (`<ul>`). As characters are entered, the array uses standard string sequence matching filters to narrow choices dynamically. It captures selections using a strict focus-lock pattern (`mousedown`) to secure and write data before closing frames can trigger a field reset.
* **UI Visual State Controller:** Tracks processes visually by toggling physical CSS helper classes (`.dot-yellow` and `.dot-green`) directly on the header markup node, creating high-end neon glow and breathing lighting animations while jobs process.

### 4. The Micro-Database Layer (Google Apps Script Engine)
* **Encrypted Payload Pipeline:** Once "Push to Sheet" runs, the popup serializes the local parameters into a tightly formed object payload and dispatches it over the open web via a standard async `Fetch API` stream requests module targeting your deployed cloud endpoint.
* **Atomic Row Appending:** Google's Cloud servers catch the string, deserialize the fields back into structured parameters, resolve your active target spreadsheet ledger, and execute a quick `.appendRow()` block. It inserts a structural date stamp (`new Date()`) first, seamlessly locking rows down across columns A to I.

---

## ✨ Core Features
* **Intelligent Visual Scraping:** Completely handles data extraction via text-proximity algorithms, protecting the extension against core Instagram frontend updates.
* **Automated Tier Tagging:** Instantly calculates the structural group your creator belongs to and displays a beautiful, custom color-coded glowing badge indicator.
* **Searchable IP Dropdown History:** remebers previously typed project tracking entries and provides a sleek, filtered drop-down combobox overlay that handles scrollbars perfectly.
* **Flexible Custom Categories:** Features a standard list of typical creator types, along with an interactive "Others" state that opens a custom free-text slot.
* **Data Sanitization:** Maintains a human-friendly view inside the popup while exporting strict numeric formatting to your sheet for easy spreadsheet metrics calculations.
* **Zero-Scroll Minimalist Interface:** Every button, grid cell, input line, and drop panel fits perfectly on a laptop screen with no layout wrapping or scrolling required.

---

## 🚀 Installation (How to install on your device)

1. **Download the Code:**
   * Download this repository as a `.zip` file and extract it into a folder sitting on your local system named `creator-scout`.
2. **Open Chrome Extensions Dashboard:**
   * Open Google Chrome and go to `chrome://extensions/`.
3. **Enable Developer Tools Framework:**
   * Toggle the **Developer mode** slider button in the upper right-hand corner to **ON**.
4. **Load the Project Folder:**
   * Click on the **Load unpacked** button located at the upper-left edge of the extensions window.
5. **Attach the Files:**
   * Select your local unpacked `creator-scout` folder directory containing your `manifest.json`.
6. **Pin for Rapid Use:**
   * Click Chrome's top extension puzzle piece icon and pin Creator Scout straight to your active browser address bar tracking space.

---

## 🗄️ Database Setup (Apps Script)

1. Open a fresh, empty tracking ledger by visiting [Google Sheets](https://sheets.new).
2. Set up headers across row 1 in **Columns A through I** exactly as shown below:
   `Date` | `Username` | `Name` | `Followers` | `Category` | `Tier` | `Type` | `IP` | `URL`
3. In the top-level menu bar, select **Extensions > Apps Script**.
4. Erase any placeholder framework code block and drop in the complete scripting backend module:

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
Click the physical Save (Floppy Disk) icon option.

Click the blue Deploy macro button option in the menu grid, then select New deployment.

Click the setup gear widget next to "Select type" and opt for Web app.

Fill out your final parameter configurations exactly as follows:

Execute as: Me (Your email)

Who has access: Anyone (Crucial: Leaving this constrained to yourself stops the extension from hitting the cloud endpoint, resulting in Network Errors).

Hit Deploy, step through the basic Google authorization consent prompts, and Copy the generated Web app URL string to your clipboard.

🎯 Usage Manual
Navigate to any target creator profile webpage on Instagram (Web version).

Open the Creator Scout panel using your browser action icon.

Paste your clipboard's Database Endpoint URL into the designated setup input line and select Save (This step saves permanently via storage synchronization).

Click the central Fetch Profile Data action element. The upper branding dot instantly glows Yellow, and your extension previews the profile stats alongside the auto-calculated bracket classification level.

Choose your target niche profile assignment using the Type selector block (or tap "Others" to instantly create a customized type value).

Provide or select a campaign tracking descriptor in the IP input area.

Select Push to Sheet. The app tracks status on screen, and the upper configuration dot shifts into a solid glowing Green light state upon a successful database save transaction!

📂 File Structure Breakdown
manifest.json: Configuration, scoping criteria blocks, active extensions permissions, and access mapping declarations.

popup.html: The structural markup nodes, custom selectors, input containers, and database setup modules.

popup.css: Premium dark styling parameters, layout constraints, custom dropdown arrows, and glowing responsive lighting nodes.

popup.js: Core controller managing storage retrieval routines, combobox data filters, payload formatting, status classes, and HTTP network transactions.

content.js: An injected programmatic traversal text analyzer script that safely reads the foreground Instagram tab text tree layers.

⚠️ Runtime Compliance Rules
Keep your main Chrome browser utility language configurations defaulted to English so keyword parsing rules function flawlessly.

Refrain from terminating the extension panel menu view while the layout button renders the "Pushing..." network processing label to ensure data transfers complete uninterrupted.
