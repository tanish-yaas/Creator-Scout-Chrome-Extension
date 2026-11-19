// ==========================================
// 🏢 MASTER DATABASE (unchanged) and YouTube API
// ==========================================
const MASTER_WEBHOOK_URL = "https://hook.eu1.make.com/3lub8lb24862yx9odq1d1avlkronthhu";
const YOUTUBE_API_KEY = "AIzaSyCtq8nF3PxPLS4dNBBX5JsUakBbK5Kyj-8";

// ==========================================
// Team database (shared moodboard + sheet)
// Paste the Apps Script web app URL and the same TEAM_KEY you set in team-backend/Code.gs.
// Everyone who installs this build of the extension shares one board.
// Leave TEAM_DB_URL empty to keep everything on this browser only.
// ==========================================
const TEAM_DB_URL = 'https://script.google.com/macros/s/AKfycbwlrwHfAkQTvK9stXXD3bxk5YxLueRR7iIZbWsrsllm28wrF3PTwFipZ6_VWP62YERj/exec';
const TEAM_KEY = 'yaas-scout-NLV9kZdgyrcJlfStZZly7Ybl';
// Set to true only if the web app is deployed with "Who has access: Anyone within <your company>".
// Everyone then needs to be signed in to Chrome / Google with their company account.
const TEAM_DOMAIN_ONLY = false;

// Where updates come from: the extension checks this GitHub repo for a newer manifest version
const UPDATE_REPO = 'tanish-yaas/Creator-Scout-Chrome-Extension';
const UPDATE_BRANCH = 'main';
