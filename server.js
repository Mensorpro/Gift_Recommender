import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// OpenRouter API and Unsplash API integration.
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const UNSPLASH_API_URL = 'https://api.unsplash.com/search/photos';

// Default configuration values via environment variables.
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || "USD";
const MINIMUM_PRICE = process.env.MINIMUM_PRICE || (DEFAULT_CURRENCY === "USD" ? "50" : "50000"); 
// For automation of common details if not provided in query.
const DEFAULT_AGE = process.env.DEFAULT_AGE || "unspecified";
const DEFAULT_EVENT = process.env.DEFAULT_EVENT || "general occasion";
const DEFAULT_GENDER = process.env.DEFAULT_GENDER || "unspecified";

// Construct common details string to automate general info.
const COMMON_DETAILS = `Additional details: Age: ${DEFAULT_AGE}, Event: ${DEFAULT_EVENT}, Gender: ${DEFAULT_GENDER}.`;

// Updated SYSTEM_PROMPT:
// • If the user's query includes a currency (e.g., USD, EUR), use that; otherwise, default to DEFAULT_CURRENCY.
// • Do not reference specific locations; provide general gift ideas.
// • Ensure realistic, significant prices (at least MINIMUM_PRICE in the chosen currency).
// • Automatically include common details (age, event, gender) if not provided separately.
const SYSTEM_PROMPT = `You are a gift advisor AI.
Provide EXACTLY 3 general gift suggestions using the EXACT format below (no markdown, no extra text).
If the user's query specifies a currency (e.g., USD, EUR), use that; otherwise, default to ${DEFAULT_CURRENCY}.
${COMMON_DETAILS}
Ensure the prices are realistic and significant (at least ${DEFAULT_CURRENCY} ${MINIMUM_PRICE} or a comparable value).

IMPORTANT: Always use numbers 1, 2, 3 for each gift (never use higher numbers like 13, 14, 15).

Format (exactly as shown, using only numbers 1, 2, 3):
1
[Gift Item Name]
Price: [Currency] [a realistic price appropriate for the gift]
Image: https://placeholder.com/400x300
Why: [One clear explanation sentence why the gift is a good choice]

2
[Gift Item Name]
Price: [Currency] [a realistic price appropriate for the gift]
Image: https://placeholder.com/400x300
Why: [One clear explanation sentence why the gift is a good choice]

3
[Gift Item Name]
Price: [Currency] [a realistic price appropriate for the gift]
Image: https://placeholder.com/400x300
Why: [One clear explanation sentence why the gift is a good choice]

Rules:
1. ALWAYS number gifts as 1, 2, and 3 (never higher numbers).
2. Use only these exact labels: "Price:", "Image:", "Why:".
3. Leave exactly one blank line between each item.
4. Do NOT include a real image URL (use the placeholder); it will be replaced by our Unsplash integration.`;

// Function to fetch a relevant image from Unsplash at 400x300.
async function fetchImageForGift(giftName) {
  try {
    if (!process.env.UNSPLASH_ACCESS_KEY) {
      console.error('Unsplash API key is missing in environment variables.');
      return null;
    }
    const searchUrl = `${UNSPLASH_API_URL}?query=${encodeURIComponent(giftName)}&per_page=1`;
    const unsplashResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
      }
    });
    if (!unsplashResponse.ok) {
      console.error('Unsplash API error:', unsplashResponse.status, unsplashResponse.statusText);
      return null;
    }
    const unsplashData = await unsplashResponse.json();
    if (unsplashData.total > 0 && unsplashData.results && unsplashData.results.length > 0) {
      let imageUrl = unsplashData.results[0].urls.regular;
      // Append sizing parameters for a 400x300 cropped image.
      if (imageUrl.includes('?')) {
        imageUrl += "&w=400&h=300&fit=crop";
      } else {
        imageUrl += "?w=400&h=300&fit=crop";
      }
      return imageUrl;
    }
    return null;
  } catch (err) {
    console.error('Error fetching image from Unsplash:', err);
    return null;
  }
}

app.post('/api/recommend', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'API key configuration error' });
    }
    console.log('Processing query:', query);

    // Use model google/gemini-2.0-flash-exp:free as requested.
    const requestBody = {
      
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Suggest 3 DIFFERENT gift ideas for: ${query}. Skip the first ${req.body.offset || 0} suggestions. Ensure that none of the suggestions are repeated from previous responses. The request id is ${Date.now()}.` }
      ],
      temperature: 0.7,
      max_tokens: 500
    };

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'AI Gift Advisor'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log('Raw response:', responseText);

    if (!response.ok) {
      let errorMessage = 'Failed to get recommendations';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        console.error('Error parsing error response:', e);
      }
      throw new Error(errorMessage);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error('Invalid response format');
    }

    const recommendations = data.choices?.[0]?.message?.content;
    if (!recommendations) {
      throw new Error('No recommendations received');
    }
    // Clean the AI response and normalize the numbers to 1,2,3
    let cleanedResponse = recommendations
      .trim()
      .replace(/\*\*/g, '')
      .replace(/\[|\]/g, '')
      .replace(/\s+\r?\n/g, '\n')
      .replace(/\r?\n\s+/g, '\n')
      .replace(/\r?\n{3,}/g, '\n\n')
      .replace(/^[\n\s]+|[\n\s]+$/g, '');
      
    // Split into sections and renumber them
    let recommendationParts = cleanedResponse.split(/\r?\n\r?\n/).filter(s => s.trim());
    recommendationParts = recommendationParts.map((section, index) => {
      let lines = section.split('\n');
      lines[0] = (index + 1).toString();
      return lines.join('\n');
    });

    cleanedResponse = recommendationParts.join('\n\n');
    let fixedResponse = cleanedResponse.replace(/\r?\n([23]\r?\n)/g, "\n\n$1");
    let processedResponse = fixedResponse.replace(/(Image:\s*https:\/\/placeholder\.com\/400x300)\s*(Why:)/gi, '$1\n$2');

    // Split into recommendation sections.
    const sections = processedResponse.split(/\r?\n\r?\n/).filter(s => s.trim());
    if (sections.length !== 3) {
      throw new Error('Invalid response format');
    }

    // Replace placeholder image URLs with Unsplash images.
    let updatedSections = [];
    for (let section of sections) {
      const lines = section.split(/\r?\n/).map(l => l.trim());
      if (lines.length < 5) throw new Error('Invalid section format');
      const giftName = lines[1];
      const imageUrl = await fetchImageForGift(giftName);
      if (imageUrl) {
        const imgIndex = lines.findIndex(line => line.startsWith('Image:'));
        lines[imgIndex] = `Image: ${imageUrl}`;
      }
      updatedSections.push(lines.join("\n"));
    }
    const outputResponse = updatedSections.join("\n\n");

    // Validate final output format.
    const finalSections = outputResponse.split(/\r?\n\r?\n/).filter(s => s.trim());
    const isValidFormat = finalSections.every(section => {
      const secLines = section.split(/\r?\n/).map(l => l.trim());
      return secLines.length >= 5 &&
             /^[123]$/.test(secLines[0]) &&
             secLines.some(l => l.startsWith('Price:')) &&
             secLines.some(l => l.startsWith('Image:')) &&
             secLines.some(l => l.startsWith('Why:'));
    });
    if (!isValidFormat) throw new Error('Invalid final response format');

    res.json({ recommendations: outputResponse });
  } catch (error) {
    console.error('Error details:', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to get recommendations', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:');
  console.log('- OPENROUTER_API_KEY present:', !!process.env.OPENROUTER_API_KEY);
  console.log('- UNSPLASH_ACCESS_KEY present:', !!process.env.UNSPLASH_ACCESS_KEY);
});
