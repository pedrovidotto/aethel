import fs from 'fs';
import path from 'path';
import https from 'https';

const PUBLIC_MP_DIR = path.join(process.cwd(), 'public', 'mediapipe');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      resolve();
      return;
    }
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlinkSync(dest);
          downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

async function main() {
  fs.mkdirSync(PUBLIC_MP_DIR, { recursive: true });

  // 1. Copy WASM runtime files from node_modules/@mediapipe/tasks-vision/wasm
  const wasmSrcDir = path.join(
    process.cwd(),
    'node_modules',
    '@mediapipe',
    'tasks-vision',
    'wasm'
  );
  if (fs.existsSync(wasmSrcDir)) {
    for (const file of fs.readdirSync(wasmSrcDir)) {
      fs.copyFileSync(path.join(wasmSrcDir, file), path.join(PUBLIC_MP_DIR, file));
    }
    console.log('[setup-assets] Copied MediaPipe WASM files to /public/mediapipe');
  } else {
    console.warn('[setup-assets] @mediapipe/tasks-vision not found in node_modules yet.');
  }

  // 2. Download face_landmarker.task model into /public/mediapipe
  const modelDest = path.join(PUBLIC_MP_DIR, 'face_landmarker.task');
  try {
    console.log('[setup-assets] Ensuring face_landmarker.task is in /public/mediapipe...');
    await downloadFile(MODEL_URL, modelDest);
    console.log('[setup-assets] face_landmarker.task ready.');
  } catch (err) {
    console.warn(
      '[setup-assets] Warning: Could not download face_landmarker.task automatically. Place it manually in /public/mediapipe/face_landmarker.task.',
      err.message
    );
  }
}

main();
