// Check if the script is already injected to prevent double-injections
if (typeof window.scoutInjected === 'undefined') {
  window.scoutInjected = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape_profile") {
      
      let data = {
        username: "",
        name: "--",
        followers: "--",
        category: "--",
        url: window.location.href
      };

      try {
        const pathParts = window.location.pathname.split('/').filter(p => p);
        if (pathParts.length > 0) {
          data.username = pathParts[0];
        }

        const header = document.querySelector('header');
        if (header) {
          const lines = header.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          
          const firstStatIndex = lines.findIndex(l => /posts|followers/i.test(l));
          
          if (firstStatIndex > 0) {
            let nameCandidate = lines[firstStatIndex - 1];
            if (nameCandidate.toLowerCase() === 'verified') {
              nameCandidate = lines[firstStatIndex - 2];
            }
            data.name = nameCandidate;
          } else {
             data.name = data.username;
          }

          const followersIndex = lines.findIndex(l => l.toLowerCase().includes('followers'));
          
          if (followersIndex !== -1) {
            data.followers = lines[followersIndex].split(' ')[0];

            let categoryIndex = followersIndex + 1;
            
            while (categoryIndex < lines.length) {
              let lowerLine = lines[categoryIndex].toLowerCase();
              if (lowerLine.includes('following') || lowerLine.includes('followed by') || lowerLine.includes('mutual')) {
                categoryIndex++;
              } else {
                break;
              }
            }

            if (categoryIndex < lines.length) {
              const nextLine = lines[categoryIndex];
              const wordCount = nextLine.split(/\s+/).length;
              const hasEmoji = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(nextLine);
              
              if (nextLine.length <= 40 && wordCount <= 5 && !hasEmoji) {
                data.category = nextLine;
              } else {
                data.category = "None";
              }
            }
          }
        }
        
        sendResponse({ status: "success", data: data });

      } catch (error) {
        sendResponse({ status: "error", message: error.message });
      }
    }
    return true; 
  });
}
