// ==========================================
// 🏢 MASTER COMPANY DATABASE CONFIGURATION
// Paste your Make.com or Zapier Webhook URL here.
const MASTER_WEBHOOK_URL = "https://hook.eu1.make.com/3lub8lb24862yx9odq1d1avlkronthhu"; 
// ==========================================

const urlInput = document.getElementById('sheet-url');
const saveUrlBtn = document.getElementById('save-url-btn');
const fetchBtn = document.getElementById('fetch-btn');
const sendBtn = document.getElementById('send-btn');
const statusMsg = document.getElementById('status-msg');
const typeSelect = document.getElementById('creator-type');
const customTypeInput = document.getElementById('custom-type');
const ipInput = document.getElementById('creator-ip');
const ipDropdown = document.getElementById('ip-dropdown');
const statusDot = document.getElementById('status-dot');

let currentProfileData = null; 
let savedIpHistory = []; 

// --- Math & Formatting Helpers ---

function parseFollowers(followerString) {
  if (!followerString || followerString === "--") return 0;
  
  let numStr = followerString.replace(/,/g, '');
  let multiplier = 1;
  
  if (numStr.toLowerCase().endsWith('k')) {
      multiplier = 1000;
      numStr = numStr.slice(0, -1);
  } else if (numStr.toLowerCase().endsWith('m')) {
      multiplier = 1000000;
      numStr = numStr.slice(0, -1);
  }
  
  return Math.round(parseFloat(numStr) * multiplier);
}

function formatFollowers(num) {
  if (num === 0) return "--";
  if (num >= 1000000) return +(num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return +(num / 1000).toFixed(2) + 'K';
  return num.toString();
}

function calculateTier(num) {
  if (num === 0) return { name: "Unknown", class: "" };
  if (num < 10000) return { name: "Nano", class: "tier-nano" };
  if (num < 50000) return { name: "Micro", class: "tier-micro" };
  if (num < 100000) return { name: "Mid-Tier", class: "tier-mid" };
  if (num < 500000) return { name: "Macro", class: "tier-macro" };
  return { name: "Mega", class: "tier-mega" };
}

// --- Load Initial Data from Chrome Storage ---

chrome.storage.sync.get(['sheetUrl', 'savedType', 'savedCustomType', 'savedIp', 'ipHistory'], (result) => {
  if (result.sheetUrl) {
    urlInput.value = result.sheetUrl;
  }
  if (result.savedIp) {
    ipInput.value = result.savedIp; 
  }
  if (result.ipHistory) {
    savedIpHistory = result.ipHistory; 
  }
  if (result.savedType) {
    typeSelect.value = result.savedType;
    if (result.savedType === 'Others') {
      customTypeInput.classList.remove('hidden');
      if (result.savedCustomType) {
        customTypeInput.value = result.savedCustomType;
      }
    }
  }
});

// --- Settings & UI Listeners ---

saveUrlBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (url) {
    chrome.storage.sync.set({ sheetUrl: url }, () => {
      showStatus("Database linked!", "success-text");
    });
  }
});

typeSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ savedType: typeSelect.value });
  if (typeSelect.value === 'Others') {
    customTypeInput.classList.remove('hidden');
  } else {
    customTypeInput.classList.add('hidden');
  }
});

customTypeInput.addEventListener('input', () => {
  chrome.storage.sync.set({ savedCustomType: customTypeInput.value });
});

// --- IP Autocomplete & History Logic ---

function saveIpToHistory(ipVal) {
  if (!ipVal) return;
  chrome.storage.sync.set({ savedIp: ipVal }); 
  
  if (!savedIpHistory.includes(ipVal)) {
    savedIpHistory.push(ipVal);
    chrome.storage.sync.set({ ipHistory: savedIpHistory });
  }
}

function renderIpDropdown() {
  const val = ipInput.value.trim().toLowerCase();
  const filtered = savedIpHistory.filter(ip => ip.toLowerCase().includes(val));
  
  ipDropdown.innerHTML = '';
  
  if (filtered.length === 0) { 
    ipDropdown.classList.add('hidden'); 
    return; 
  }
  
  filtered.forEach(ip => {
    const li = document.createElement('li');
    li.innerText = ip;
    
    li.addEventListener('mousedown', (e) => { 
      e.preventDefault(); 
      ipInput.value = ip; 
      saveIpToHistory(ip); 
      ipDropdown.classList.add('hidden'); 
    });
    
    ipDropdown.appendChild(li);
  });
  
  ipDropdown.classList.remove('hidden');
}

ipInput.addEventListener('focus', renderIpDropdown);

ipInput.addEventListener('input', () => { 
  chrome.storage.sync.set({ savedIp: ipInput.value }); 
  renderIpDropdown(); 
});

ipInput.addEventListener('keydown', (e) => { 
  if (e.key === 'Enter') { 
    e.preventDefault(); 
    saveIpToHistory(ipInput.value.trim()); 
    ipDropdown.classList.add('hidden'); 
    ipInput.blur(); 
  }
});

ipInput.addEventListener('blur', () => { 
  saveIpToHistory(ipInput.value.trim()); 
  ipDropdown.classList.add('hidden'); 
});

// --- Core Actions (Fetch & Push) ---

fetchBtn.addEventListener('click', async () => {
  showStatus("Scanning...", "");
  statusDot.className = 'brand-dot dot-yellow';
  
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes("instagram.com")) { 
    showStatus("Error: Open an Instagram profile.", "error-text"); 
    statusDot.className = 'brand-dot'; 
    return; 
  }
  
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }, () => {
    chrome.tabs.sendMessage(tab.id, { action: "scrape_profile" }, (response) => {
      
      if (chrome.runtime.lastError || !response || response.status === "error") { 
        showStatus("Scan failed.", "error-text"); 
        statusDot.className = 'brand-dot'; 
        return; 
      }
      
      currentProfileData = response.data;
      const rawFollowers = parseFollowers(currentProfileData.followers);
      const tierInfo = calculateTier(rawFollowers);
      
      currentProfileData.followers = rawFollowers;
      currentProfileData.tier = tierInfo.name;
      
      document.getElementById('prev-name').innerText = currentProfileData.name;
      document.getElementById('prev-handle').innerText = currentProfileData.username;
      document.getElementById('prev-followers').innerText = formatFollowers(rawFollowers);
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
  
  const finalType = typeSelect.value === 'Others' ? customTypeInput.value.trim() : typeSelect.value;
  currentProfileData.type = finalType;
  
  const finalIp = ipInput.value.trim();
  saveIpToHistory(finalIp);
  currentProfileData.ip = finalIp;
  
  sendBtn.innerText = "Pushing...";
  
  try {
    // 1. PUSH TO THE USER'S PERSONAL GOOGLE SHEET
    const response = await fetch(sheetUrl, { 
      method: "POST", 
      headers: { "Content-Type": "text/plain" }, 
      body: JSON.stringify(currentProfileData) 
    });
    
    const result = await response.json();
    
    if (result.status === "Success") { 
      
      // 2. SILENT PUSH TO MASTER COMPANY DATABASE (If Webhook is provided)
      if (MASTER_WEBHOOK_URL && MASTER_WEBHOOK_URL !== "") {
        fetch(MASTER_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentProfileData)
        }).catch(err => console.log("Master DB silent fail, ignoring:", err));
      }

      showStatus("Pushed to Sheet!", "success-text"); 
      sendBtn.innerText = "Push to Sheet"; 
      statusDot.className = 'brand-dot dot-green'; 
    } else {
      throw new Error();
    }
    
  } catch (error) { 
    showStatus("Network error.", "error-text"); 
    sendBtn.innerText = "Push to Sheet"; 
    statusDot.className = 'brand-dot'; 
  }
});

function showStatus(text, className) { 
  statusMsg.innerText = text; 
  statusMsg.className = className; 
}
