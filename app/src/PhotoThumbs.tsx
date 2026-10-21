import { useEffect, useState } from 'react';
import { usePhotoUrls } from './photos';

// タップした写真を画面いっぱいに表示する。どこかをタップすると閉じる
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="写真の拡大表示">
      <img src={src} alt="" />
      <button type="button" className="small lightbox-close">
        ✕ 閉じる
      </button>
    </div>
  );
}

// 写真のサムネイルを並べる。srcs が undefined の間は読み込み中、false は読み込み失敗
export function ThumbGrid({ srcs, large = false }: { srcs: (string | false | undefined)[]; large?: boolean }) {
  const [open, setOpen] = useState('');
  return (
    <>
      <div className={`thumbs ${large ? 'large' : ''}`}>
        {srcs.map((src, i) =>
          src ? (
            <button type="button" key={i} className="thumb" onClick={() => setOpen(src)} aria-label={`写真${i + 1}を拡大`}>
              <img src={src} alt="" />
            </button>
          ) : (
            <div key={i} className="thumb placeholder">
              {src === false ? '読込失敗' : '…'}
            </div>
          ),
        )}
      </div>
      {open && <Lightbox src={open} onClose={() => setOpen('')} />}
    </>
  );
}

// 保存済みの写真（Storage のパス）のサムネイル
export default function PhotoThumbs({ paths, large }: { paths: string[]; large?: boolean }) {
  return <ThumbGrid srcs={usePhotoUrls(paths)} large={large} />;
}
