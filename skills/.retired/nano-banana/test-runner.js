const { spawn } = require('child_process');
const fs = require('fs');

const out = '.context/generated-images/puppy-motorcycle.png';
try { fs.mkdirSync('.context/generated-images', { recursive: true }); } catch {}
try { fs.unlinkSync(out); } catch {}

const child = spawn(process.execPath, [
  'agent/skills/nano-banana/generate-image.js',
  '--prompt',
  'A playful golden retriever puppy riding a motorcycle down a scenic coastal road, cinematic lighting, dynamic action shot, highly detailed',
  '--output',
  out
], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });

let stdout = '';
let stderr = '';
child.stdout.on('data', (d) => { stdout += d.toString(); });
child.stderr.on('data', (d) => { stderr += d.toString(); });
child.on('close', (code) => {
  const exists = fs.existsSync(out);
  const size = exists ? fs.statSync(out).size : 0;
  console.log(JSON.stringify({ code, exists, size, stdoutTail: stdout.slice(-500), stderrTail: stderr.slice(-500) }, null, 2));
});
