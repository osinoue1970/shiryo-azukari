import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { supabase } from './db';

export type PaperSize = 'a4' | 'a5' | 'b5';

export const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  a5: { w: 148, h: 210 },
  b5: { w: 182, h: 257 }, // JIS B5
};

// 画面上の用紙要素を画像化して PDF にする（日本語フォントやサイン画像をそのまま再現できる）。
// 用紙より長い場合はページを分割する。
export async function elementToPdf(el: HTMLElement, size: PaperSize): Promise<Blob> {
  const canvas = await html2canvas(el, { scale: 2.5, backgroundColor: '#ffffff', useCORS: true });
  const { w, h } = PAPER_MM[size];
  const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait', compress: true });
  const pxPerMm = canvas.width / w;
  const pagePx = Math.floor(h * pxPerMm);
  const pages = Math.max(1, Math.ceil((canvas.height - 2) / pagePx));
  for (let p = 0; p < pages; p++) {
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.min(pagePx, canvas.height - p * pagePx);
    const ctx = slice.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, -p * pagePx);
    if (p > 0) pdf.addPage([w, h], 'portrait');
    pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, w, slice.height / pxPerMm);
  }
  return pdf.output('blob');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function sendPdfMail(params: { to: string; subject: string; text: string; filename: string; pdf: Blob }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('ログインし直してください。');
  const res = await fetch('/api/send-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: params.to, subject: params.subject, text: params.text, filename: params.filename, pdfBase64: await blobToBase64(params.pdf) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `送信に失敗しました（${res.status}）`);
}

// iPhone では共有シート（メール・ファイル保存など）、PC ではダウンロード
export async function savePdf(pdf: Blob, filename: string) {
  const file = new File([pdf], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(pdf);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
