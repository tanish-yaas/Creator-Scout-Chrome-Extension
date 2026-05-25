const urlInput = document.getElementById('sheet-url');
const saveUrlBtn = document.getElementById('save-url-btn');
const fetchBtn = document.getElementById('fetch-btn');
const sendBtn = document.getElementById('send-btn');
const statusMsg = document.getElementById('status-msg');

let currentProfileData = null; 

function calculateTier(followerString) {
  if (!followerString || followerString === "--") return { name: "Unknown", class: "" };
  
  let numStr = followerString.replace(/,/g, '');
  let multiplier = 1;
  
  if (numStr.toLowerCase().endsWith('k')) {
      multiplier = 1000;
      numStr = numStr.slice(0, -1);
  } else if (numStr.toLowerCase().endsWith('m')) {
      multiplier = 1000000;
      numStr = numStr.slice(0, -1);
  }
  
  let num = parseFloat(numStr) * multiplier;

  if (num < 10000) return { name: "Nano", class: "tier-nano" };
  if (num < 50000) return { name: "Micro", class: "tier-micro" };
  if (num < 100000) return { name: "Mid-Tier", class: "tier-mid" };
  if (num < 500000) return { name: "Macro", class: "tier-macro" };
  return { name: "Mega", class: "tier-mega" };
}

chrome.storage.sync.get(['sheetUrl'], (result) => {
  if (result.sheetUrl) urlInput.value = result.sheetUrl;
});

saveUrlBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (url) {
    chrome.storage.sync.set({ sheetUrl: url }, () => {
      showStatus("Database linked!", "success-text");
    });
  }
});

fetchBtn.addEventListener('click', async () => {
  showStatus("Scanning...", "");
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes("instagram.com")) {
    showStatus("Error: Open an Instagram profile.", "error-text");
    return;
  }

  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }, () => {
    chrome.tabs.sendMessage(tab.id, { action: "scrape_profile" }, (response) => {
      if (chrome.runtime.lastError || !response || response.status === "error") {
        showStatus("Scan failed. Try refreshing the page.", "error-text");
        return;
      }

      currentProfileData = response.data;
      
      const tierInfo = calculateTier(currentProfileData.followers);
      currentProfileData.tier = tierInfo.name;
      
      document.getElementById('prev-name').innerText = currentProfileData.name;
      document.getElementById('prev-handle').innerText = currentProfileData.username;
      document.getElementById('prev-followers').innerText = currentProfileData.followers;
      document.getElementById('prev-category').innerText = currentProfileData.category;
      
      const tierElement = document.getElementById('prev-tier');
      tierElement.innerText = tierInfo.name;
      tierElement.className = "pill " + tierInfo.class; 

      showStatus("Data fetched!", "success-text");
      sendBtn.classList.remove('hidden');
    });
  });
});

sendBtn.addEventListener('click', async () => {
  const sheetUrl = urlInput.value.trim();
  if (!sheetUrl) return showStatus("Save your Database URL first!", "error-text");
  if (!currentProfileData) return showStatus("Fetch data first.", "error-text");

  sendBtn.innerText = "Pushing...";
  
  try {
    const response = await fetch(sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" }, 
      body: JSON.stringify(currentProfileData)
    });

    const result = await response.json();
    
    if (result.status === "Success") {
      showStatus("Pushed to Sheet!", "success-text");
      sendBtn.innerText = "Push to Sheet"; 
    } else {
      throw new Error();
    }
  } catch (error) {
    showStatus("Network error.", "error-text");
    sendBtn.innerText = "Push to Sheet";
  }
});

function showStatus(text, className) {
  statusMsg.innerText = text;
  statusMsg.className = className;
}