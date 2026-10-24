// Opens a statement PDF on the phone (unlocking it with its password) and pulls out the text.
// The PDF file itself is never uploaded anywhere.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export class NeedsPassword extends Error {
  constructor(wrong) {
    super(wrong ? 'That password didn’t open the PDF. Try again.' : 'This PDF is locked with a password.');
    this.name = 'NeedsPassword';
    this.wrong = wrong;
  }
}

export const MAX_PAGES = 40;

export async function openPdf(file, password) {
  const data = new Uint8Array(await file.arrayBuffer());
  const base = new URL('./pdfjs/', document.baseURI).href;
  const task = pdfjs.getDocument({
    data,
    password: password || undefined,
    isEvalSupported: false,
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
  });
  try {
    return await task.promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw new NeedsPassword(e.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    throw new Error('This file couldn’t be opened. Make sure it’s the PDF statement from your bank.');
  }
}

/** Rebuilds the page as lines of text, keeping table columns apart with " | ". */
async function pageText(page) {
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || i.height || 8, s: i.str }));
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of items) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - it.y) <= Math.max(2, Math.min(last.h, it.h) * 0.45)) last.items.push(it);
    else rows.push({ y: it.y, h: it.h, items: [it] });
  }
  const lines = rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    let out = '';
    let end = null;
    for (const it of r.items) {
      if (end !== null) {
        const gap = it.x - end;
        const charW = Math.max(2, it.h * 0.5);
        if (gap > charW * 2.2) out += ' | ';
        else if (gap > charW * 0.25 && !out.endsWith(' ') && !it.s.startsWith(' ')) out += ' ';
      }
      out += it.s;
      end = it.x + it.w;
    }
    return out.replace(/\s+/g, ' ').trim();
  });
  return lines.filter(Boolean).join('\n');
}

async function pageImage(page) {
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(2, 1600 / vp1.width);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const url = canvas.toDataURL('image/jpeg', 0.82);
  canvas.width = canvas.height = 0;
  return url.split(',')[1];
}

/**
 * Returns [{ n, text }] or [{ n, image }] for scanned pages with no text layer.
 * onPage(done, total) reports progress.
 */
export async function readPages(doc, onPage) {
  const total = Math.min(doc.numPages, MAX_PAGES);
  const pages = [];
  for (let n = 1; n <= total; n++) {
    const page = await doc.getPage(n);
    const text = await pageText(page);
    if (text.replace(/\s/g, '').length >= 40) pages.push({ n, text });
    else pages.push({ n, image: await pageImage(page) });
    page.cleanup();
    onPage && onPage(n, total);
  }
  return { pages, truncated: doc.numPages > MAX_PAGES, numPages: doc.numPages };
}

/** Hides long digit runs (account, card and reference numbers) except the last 4 digits. */
export function maskNumbers(text) {
  return text.replace(/\d{9,}/g, (m) => 'X'.repeat(m.length - 4) + m.slice(-4));
}

/** Groups pages into batches small enough for one request each. */
export function chunkPages(pages, maxChars = 11000, maxPages = 4) {
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const p of pages) {
    const len = p.image ? 6000 : p.text.length;
    if (cur.length && (size + len > maxChars || cur.length >= maxPages || (p.image && cur.some((x) => x.image)))) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(p);
    size += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
