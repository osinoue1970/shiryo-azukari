import { useState, type Dispatch, type SetStateAction } from 'react';
import { newId } from './db';
import { compressImage, uploadPhoto, type PhotoKind } from './photos';
import { Lightbox } from './PhotoThumbs';

// 撮影した写真1枚分。撮った直後に縮小して裏で送信を始めるので、確定ボタンを押すときには送り終わっている
export interface CapturedPhoto {
  key: string;
  preview: string; // 縮小後の object URL（縮小中は ''）
  blob?: Blob;
  path?: string; // 送信できたら Storage のパス
  status: 'working' | 'done' | 'error';
  error?: string;
}

export const photoPaths = (list: CapturedPhoto[]) => [...new Set(list.flatMap((p) => (p.path ? [p.path] : [])))];
export const photosBusy = (list: CapturedPhoto[]) => list.some((p) => p.status === 'working');
export const photosFailed = (list: CapturedPhoto[]) => list.some((p) => p.status === 'error');

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// 資料・伝票を撮影する欄。iPhone ではカメラが開き、PC ではファイル選択になる
export default function PhotoCapture({
  depositId,
  kind,
  photos,
  setPhotos,
  shootLabel,
  hint,
}: {
  depositId: string;
  kind: PhotoKind;
  photos: CapturedPhoto[];
  setPhotos: Dispatch<SetStateAction<CapturedPhoto[]>>;
  shootLabel: string;
  hint?: string;
}) {
  const [open, setOpen] = useState('');
  const update = (key: string, patch: Partial<CapturedPhoto>) => setPhotos((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const send = async (key: string, blob: Blob) => {
    update(key, { status: 'working', error: undefined });
    try {
      update(key, { status: 'done', path: await uploadPhoto(depositId, kind, blob) });
    } catch (e) {
      update(key, { status: 'error', error: message(e) });
    }
  };

  const add = async (files: FileList | null) => {
    // 縮小は1枚ずつ（メモリ節約）、送信は並行して進める
    for (const file of Array.from(files ?? [])) {
      const key = newId();
      setPhotos((list) => [...list, { key, preview: '', status: 'working' }]);
      try {
        const blob = await compressImage(file);
        update(key, { blob, preview: URL.createObjectURL(blob) });
        void send(key, blob);
      } catch (e) {
        update(key, { status: 'error', error: message(e) });
      }
    }
  };

  const remove = (key: string) => setPhotos((list) => list.filter((p) => p.key !== key));
  const failed = photos.find((p) => p.status === 'error');

  return (
    <div className="photo-capture">
      <div className="photo-buttons">
        <label className="btn photo-shoot">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
          📷 {photos.length ? 'もう1枚撮る' : shootLabel}
        </label>
        <label className="btn small photo-album">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
          🖼 アルバムから選ぶ
        </label>
      </div>
      {hint && <p className="small-text muted photo-hint">{hint}</p>}
      {photos.length > 0 && (
        <div className="thumbs">
          {photos.map((p, i) => (
            <div key={p.key} className={`cap-thumb ${p.status}`}>
              {p.preview ? (
                <button type="button" className="thumb" onClick={() => setOpen(p.preview)} aria-label={`写真${i + 1}を拡大`}>
                  <img src={p.preview} alt="" />
                </button>
              ) : (
                <div className="thumb placeholder">…</div>
              )}
              <span className="cap-status">{p.status === 'working' ? '送信中' : p.status === 'done' ? '✓' : '失敗'}</span>
              <button type="button" className="cap-remove" onClick={() => remove(p.key)} aria-label="この写真を外す">
                ✕
              </button>
              {p.status === 'error' && p.blob && (
                <button type="button" className="small cap-retry" onClick={() => send(p.key, p.blob!)}>
                  再送
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {failed && <div className="error" style={{ margin: '10px 0 0' }}>{failed.error}</div>}
      {open && <Lightbox src={open} onClose={() => setOpen('')} />}
    </div>
  );
}
