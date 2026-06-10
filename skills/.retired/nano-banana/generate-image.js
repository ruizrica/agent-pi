#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  let prompt = '';
  let inputImage = '';
  let output = '';
  let model = 'google/gemini-3.1-flash-image-preview';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prompt') prompt = args[++i] || '';
    else if (arg === '--input-image') inputImage = args[++i] || '';
    else if (arg === '--output') output = args[++i] || '';
    else if (arg === '--model') model = args[++i] || model;
  }

  if (!prompt.trim()) {
    console.error('Missing required --prompt');
    process.exit(1);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set');
    process.exit(1);
  }

  const outDir = path.resolve(process.cwd(), '.context/generated-images');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.resolve(output || path.join(outDir, `nano-banana-${Date.now()}.png`));

  const content = [{ type: 'text', text: prompt }];
  if (inputImage) {
    const absInput = path.resolve(inputImage);
    const buffer = fs.readFileSync(absInput);
    const ext = path.extname(absInput).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.webp' ? 'image/webp'
      : ext === '.gif' ? 'image/gif'
      : 'image/png';
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${mime};base64,${buffer.toString('base64')}`
      }
    });
  }

  const body = {
    model,
    modalities: ['image','text'],
    messages: [
      {
        role: 'user',
        content
      }
    ]
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
  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const message = json.choices?.[0]?.message;
  const images = [];
  if (Array.isArray(message?.images)) images.push(...message.images);
  if (Array.isArray(message?.content)) {
    for (const item of message.content) {
      if (item?.type === 'image_url' && item.image_url?.url) images.push(item.image_url.url);
      if (item?.type === 'image_url' && typeof item.image_url === 'string') images.push(item.image_url);
      if (item?.type === 'output_image' && item?.image_url) images.push(item.image_url);
      if (item?.type === 'output_image' && item?.output_image) images.push(item.output_image);
      if (item?.type === 'image' && item?.data) images.push(item.data);
      if (item?.type === 'image' && item?.source?.data) images.push(item.source.data);
      if (item?.type === 'image_base64' && item?.image_base64) images.push(item.image_base64);
      if (item?.type === 'file' && item?.file_data) images.push(item.file_data);
      if (item?.type === 'input_image' && item?.image_url) images.push(item.image_url);
      if (item?.b64_json) images.push(item.b64_json);
    }
  }

  const first = images[0];
  if (!first) {
    const directBase64 = message?.content
      ?.map((item) => {
        if (typeof item?.image_url === 'string' && !item.image_url.startsWith('data:')) return item.image_url;
        if (typeof item?.image_url === 'string' && item.image_url.startsWith('data:')) return item.image_url;
        if (item?.image_url?.url) return item.image_url.url;
        if (item?.output_image) return item.output_image;
        if (item?.b64_json) return item.b64_json;
        return null;
      })
      .find(Boolean);
    if (!directBase64) {
      console.log(JSON.stringify({ ok: true, warning: 'No image returned', response: json }, null, 2));
      return;
    }
    images.push(directBase64);
  }

  const chosen = images[0];
  let base64 = '';
  if (typeof chosen === 'string' && chosen.startsWith('data:')) {
    base64 = chosen.split(',')[1] || '';
  } else if (typeof chosen === 'string' && /^[A-Za-z0-9+/=\n\r]+$/.test(chosen) && chosen.length > 256) {
    base64 = chosen.replace(/\s+/g, '');
  } else if (typeof chosen === 'string') {
    const imgRes = await fetch(chosen);
    const arrayBuf = await imgRes.arrayBuffer();
    base64 = Buffer.from(arrayBuf).toString('base64');
  } else if (chosen?.image_url?.url && typeof chosen.image_url.url === 'string' && chosen.image_url.url.startsWith('data:')) {
    base64 = chosen.image_url.url.split(',')[1] || '';
  } else if (chosen?.url && typeof chosen.url === 'string' && chosen.url.startsWith('data:')) {
    base64 = chosen.url.split(',')[1] || '';
  } else if (chosen?.b64_json) {
    base64 = chosen.b64_json;
  }

  if (!base64) {
    console.log(JSON.stringify({ ok: true, warning: 'Image payload format not recognized', response: json }, null, 2));
    return;
  }

  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  console.log(JSON.stringify({ ok: true, output: outPath }, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
