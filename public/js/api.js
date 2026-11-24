// Where the cloud backend lives. By default the dashboard is served by the backend itself
// (Northflank), so API calls go to the same origin. To host the page elsewhere, set
// <meta name="eyedentify-api" content="https://your-service.code.run"> in index.html.
const configured = document.querySelector('meta[name="eyedentify-api"]')?.content?.trim() ?? '';
export const API_BASE = configured.replace(/\/+$/, '');
export const apiUrl = (path) => `${API_BASE}${path}`;
