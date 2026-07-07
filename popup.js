// ==========================================
// 🏢 CONFIGURATION
// ==========================================
const MASTER_WEBHOOK_URL = "https://hook.eu1.make.com/3lub8lb24862yx9odq1d1avlkronthhu"; 
const YOUTUBE_API_KEY = "AIzaSyCtq8nF3PxPLS4dNBBX5JsUakBbK5Kyj-8";    

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

const toggleIg = document.getElementById('toggle-ig');
const toggleYt = document.getElementById('toggle-yt');
const labelFollowers = document.getElementById('label-followers');
const igOnlyRows = document.querySelectorAll('.ig-only');
const ytOnlyRows = document.querySelectorAll('.yt-only');

let currentProfileData = null; 
let savedIpHistory = []; 
let currentPlatform = 'Instagram'; 

// --- Platform Toggling ---

function setPlatform(platform) {
  currentPlatform = platform;
  chrome.storage.sync.set({ savedPlatform: platform });
  
  if (platform === 'Instagram') {
    toggleIg.classList.add('active');
    toggleYt.classList.remove('active');
    labelFollowers.innerText = 'Followers';
    
    igOnlyRows.forEach(el => {
      el.classList.remove('hidden');
    });
    
    ytOnlyRows.forEach(el => {
      el.classList.add('hidden');
    });
    
  } else {
    toggleYt.classList.add('active');
    toggleIg.classList.remove('active');
    labelFollowers.innerText = 'Subscribers';
    
    igOnlyRows.forEach(el => {
      el.classList.add('hidden');
    });
    
    ytOnlyRows.forEach(el => {
      el.classList.remove('hidden');
    });
  }
}

toggleIg.addEventListener('click', () => {
  setPlatform('Instagram');
});

toggleYt.addEventListener('click', () => {
  setPlatform('YouTube');
});

// --- Math Helpers ---

function parseFollowers(followerString) {
  if (!followerString || followerString === "--") {
    return 0;
  }
  
  let numStr = followerString.toString().replace(/,/g, '');
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

function formatNumber(num) {
  if (num === 0 || !num) {
    return "--";
  }
  if (num >= 1000000) {
    return +(num / 1000000).toFixed(2) + 'M';
  }
  if (num >= 1000) {
    return +(num / 1000).toFixed(2) + 'K';
  }
  return num.toString();
}

function calculateTier(num) {
  if (num === 0 || !num) {
    return { name: "Unknown", class: "" };
  }
  if (num < 10000) {
    return { name: "Nano", class: "tier-nano" };
  }
  if (num < 50000) {
    return { name: "Micro", class: "tier-micro" };
  }
  if (num < 100000) {
    return { name: "Mid-Tier", class: "tier-mid" };
  }
  if (num < 500000) {
    return { name: "Macro", class: "tier-macro" };
  }
  return { name: "Mega", class: "tier-mega" };
}

// --- Init & Storage ---

chrome.storage.sync.get(['sheetUrl', 'savedType', 'savedCustomType', 'savedIp', 'ipHistory', 'savedPlatform'], (result) => {
  if (result.sheetUrl) {
    urlInput.value = result.sheetUrl;
  }
  
  if (result.savedIp) {
    ipInput.value = result.savedIp; 
  }
  
  if (result.ipHistory) {
    savedIpHistory = result.ipHistory; 
  }
  
  if (result.savedPlatform) {
    setPlatform(result.savedPlatform);
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

// --- IP Autocomplete ---

function saveIpToHistory(ipVal) {
  if (!ipVal) {
    return;
  }
  
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

// --- YOUTUBE API LOGIC (Auto-Detect Tab URL) ---

async function handleYouTubeFetch() {
  if (!YOUTUBE_API_KEY) {
    showStatus("Error: Missing YT API Key.", "error-text");
    statusDot.className = 'brand-dot';
    return;
  }

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes("youtube.com")) { 
    showStatus("Error: Open a YouTube channel page.", "error-text"); 
    statusDot.className = 'brand-dot'; 
    return; 
  }

  let rawInput = tab.url;
  let endpoint1 = '';
  let cleanHandle = '';
  let cleanId = '';

  if (rawInput.includes('@')) {
    cleanHandle = rawInput.split('@')[1].split('/')[0].split('?')[0];
    endpoint1 = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&forHandle=${cleanHandle}&key=${YOUTUBE_API_KEY}`;
  } else if (rawInput.includes('channel/')) {
    cleanId = rawInput.split('channel/')[1].split('/')[0].split('?')[0];
    endpoint1 = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${cleanId}&key=${YOUTUBE_API_KEY}`;
  } else {
    showStatus("Error: Must be on a Channel profile.", "error-text"); 
    statusDot.className = 'brand-dot'; 
    return;
  }

  try {
    // 1. Fetch Channel Info & Uploads Playlist ID
    const res1 = await fetch(endpoint1);
    const data1 = await res1.json();

    if (!data1.items || data1.items.length === 0) {
      showStatus("Channel not found.", "error-text");
      statusDot.className = 'brand-dot';
      return;
    }

    const channel = data1.items[0];
    const rawSubs = parseInt(channel.statistics.subscriberCount) || 0;
    const tierInfo = calculateTier(rawSubs);
    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;

    // 2. Fetch Last 10 Video IDs
    let avgViews = 0;
    
    if (uploadsPlaylistId) {
      const res2 = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=10&key=${YOUTUBE_API_KEY}`);
      const data2 = await res2.json();

      if (data2.items && data2.items.length > 0) {
        const videoIds = data2.items.map(item => item.contentDetails.videoId).join(',');

        // 3. Fetch Views for those 10 Videos & Average Them
        const res3 = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${YOUTUBE_API_KEY}`);
        const data3 = await res3.json();

        if (data3.items && data3.items.length > 0) {
          let sum = 0;
          data3.items.forEach(v => {
            sum += parseInt(v.statistics.viewCount) || 0;
          });
          avgViews = Math.round(sum / data3.items.length);
        }
      }
    }

    currentProfileData = {
      platform: "YouTube",
      username: channel.snippet.customUrl || channel.id,
      name: channel.snippet.title,
      followers: rawSubs,
      tier: tierInfo.name,
      url: `https://youtube.com/${channel.snippet.customUrl || ('channel/' + channel.id)}`,
      avgViews: avgViews,
      country: channel.snippet.country || "--",
      category: "--" 
    };

    updateUIWithData(currentProfileData, tierInfo);
    showStatus("YouTube Data fetched!", "success-text"); 
    sendBtn.classList.remove('hidden');

  } catch (error) {
    showStatus("API Fetch failed.", "error-text");
    statusDot.className = 'brand-dot';
  }
}

// --- IG SCRAPING LOGIC ---

async function handleInstagramFetch() {
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
      
      const rawFollowers = parseFollowers(response.data.followers);
      const tierInfo = calculateTier(rawFollowers);
      
      currentProfileData = {
        ...response.data,
        platform: "Instagram",
        followers: rawFollowers,
        tier: tierInfo.name,
        avgViews: "--",
        country: "--"
      };
      
      updateUIWithData(currentProfileData, tierInfo);
      showStatus("IG Data fetched!", "success-text"); 
      sendBtn.classList.remove('hidden');
    });
  });
}

// --- Common UI Updater ---

function updateUIWithData(data, tierInfo) {
  document.getElementById('prev-name').innerText = data.name;
  document.getElementById('prev-handle').innerText = data.username;
  document.getElementById('prev-followers').innerText = formatNumber(data.followers);
  
  if (data.platform === 'Instagram') {
    document.getElementById('prev-category').innerText = data.category;
  } else {
    document.getElementById('prev-views').innerText = formatNumber(data.avgViews);
  }

  const tierElement = document.getElementById('prev-tier');
  tierElement.innerText = tierInfo.name; 
  tierElement.className = "pill " + tierInfo.class; 
}

fetchBtn.addEventListener('click', () => {
  showStatus("Scanning...", "");
  statusDot.className = 'brand-dot dot-yellow';
  
  if (currentPlatform === 'YouTube') {
    handleYouTubeFetch();
  } else {
    handleInstagramFetch();
  }
});

// --- Push Logic ---

sendBtn.addEventListener('click', async () => {
  const sheetUrl = urlInput.value.trim();
  
  if (!sheetUrl || !sheetUrl.includes("script.google.com")) {
      return showStatus("Save your Database URL first!", "error-text");
  }
  
  if (!currentProfileData) {
      return showStatus("Fetch data first.", "error-text");
  }
  
  const finalType = typeSelect.value === 'Others' ? customTypeInput.value.trim() : typeSelect.value;
  currentProfileData.type = finalType;
  
  const finalIp = ipInput.value.trim();
  saveIpToHistory(finalIp);
  currentProfileData.ip = finalIp;
  
  sendBtn.innerText = "Pushing...";
  
  try {
    const response = await fetch(sheetUrl, { 
      method: "POST", 
      headers: { "Content-Type": "text/plain" }, 
      body: JSON.stringify(currentProfileData) 
    });
    
    const result = await response.json();
    
    if (result.status === "Success") { 
      
      if (MASTER_WEBHOOK_URL && MASTER_WEBHOOK_URL !== "") {
        fetch(MASTER_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentProfileData)
        }).catch(err => {
            console.log("Master DB silent fail:", err);
        });
      }
      
      // FIX: Changed from dynamic platform text back to static "Pushed to Sheet!"
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