import { useEffect, useState } from 'react';
import { newId, sha256Bytes, supabase } from './db';

// 預かり時の資料・発送時の伝票の写真。非公開の Storage に保存し、上書き・削除はできない。

const BUCKET = 'deposit-photos';
const MAX_EDGE = 2000; // 伝票の番号が読める大きさ
const QUALITY = 0.85;

export type PhotoKind = 'receive' | 'return';

// 撮影した写真を長辺 2000px の JPEG に縮小する。向きは <img> が EXIF に従って直してくれる
export async function compressImage(file: Blob): Promise<Blob> {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode().catch(() => {
      throw new Error('この画像は読み込めません。カメラで撮り直してください。');
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('写真の変換に失敗しました。'))), 'image/jpeg', QUALITY),
    );
  } finally {
    URL.revokeObjectURL(src);
  }
}

// ファイル名を写真の中身の SHA-256 にする。照合コードにパスを含めれば写真の差し替えも検出できる
export async function uploadPhoto(depositId: string, kind: PhotoKind, blob: Blob): Promise<string> {
  const name = crypto.subtle ? await sha256Bytes(await blob.arrayBuffer()) : newId(); // crypto.subtle は https のみ
  const path = `${depositId}/${kind}/${name}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  // 同じ写真を送り直したときは既にあるので成功扱い
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`写真を送信できませんでした（${error.message}）`);
  return path;
}

// 写真は変更されないので、一度取得したものはページを開いている間使い回す
const cache = new Map<string, Promise<string>>();

function loadPhoto(path: string): Promise<string> {
  let p = cache.get(path);
  if (!p) {
    p = supabase.storage
      .from(BUCKET)
      .download(path)
      .then(({ data, error }) => {
        if (error || !data) throw error ?? new Error('not found');
        // object URL は同一オリジンなので、html2canvas の PDF 化でもそのまま写る
        return URL.createObjectURL(data);
      });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

// 保存済み写真の表示用 URL。読み込み中は undefined、失敗したら false
export function usePhotoUrls(paths: string[]): (string | false | undefined)[] {
  const key = paths.join('|');
  const [urls, setUrls] = useState<Record<string, string | false>>({});
  useEffect(() => {
    let alive = true;
    for (const path of paths) {
      loadPhoto(path).then(
        (url) => alive && setUrls((u) => ({ ...u, [path]: url })),
        () => alive && setUrls((u) => ({ ...u, [path]: false })),
      );
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return paths.map((p) => urls[p]);
}

// 用紙の中の画像（写真・QRコード）がすべて表示されるまで待つ。読み込み中の写真は data-loading の枠で表示している
export async function waitForImages(el: HTMLElement, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  await new Promise((r) => setTimeout(r, 50)); // 直前の state 変更が画面に反映されるのを待つ
  while (Date.now() < end) {
    const imgs = [...el.querySelectorAll('img')];
    if (!el.querySelector('[data-loading]') && imgs.every((i) => i.complete)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}
