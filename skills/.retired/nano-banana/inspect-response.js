const fs = require('fs');

(async () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const body = {
    model: 'google/gemini-3.1-flash-image-preview',
    modalities: ['image','text'],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'A playful golden retriever puppy riding a motorcycle down a scenic coastal road, cinematic lighting, dynamic action shot, highly detailed' }] }]
  };
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://pi.local',
      'X-Title': 'Pi Nano Banana Skill'
    },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  console.log(JSON.stringify(json.choices?.[0]?.message, null, 2));
})();
