import axios from 'axios';

export async function getEmoteGif(emote) {
  console.log(`[DEBUG] Fetching GIF for emote: ${emote}`);
  try {
    const url = `https://kawaii.red/api/gif/${emote}?token=${process.env.KAWAII_API_KEY}&type=txt&filter=sfw`;
    console.log(`[DEBUG] Constructed URL: ${url}`);

    const response = await axios.get(url);

    if (typeof response.data === 'string' && response.data.startsWith('http')) {
      console.log(`[DEBUG] GIF fetched successfully for emote: ${emote}`);
      return response.data;
    }

    if (response.data && response.data.response) {
      console.log(`[DEBUG] GIF fetched successfully for emote: ${emote}`);
      return response.data.response;
    }

    console.error('[DEBUG] Unexpected API response format:', response.data);
    return null;
  } catch (err) {
    if (err.response) {
      console.error(`[DEBUG] API Error: Status=${err.response.status}, Message=${err.response.data}`);
    } else if (err.request) {
      console.error('[DEBUG] No response received from API:', err.request);
    } else {
      console.error(`[DEBUG] Error setting up request: ${err.message}`);
    }
    return null;
  }
}
