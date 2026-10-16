import { useState } from 'react';

// 印刷ダイアログを閉じた後に「印刷済みにするか」を確認する（印刷したかどうかはブラウザから分からないため）
export default function PrintedPrompt({ onYes, onDone, label = '印刷できましたか？' }: { onYes: () => Promise<void>; onDone: () => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const yes = async () => {
    setBusy(true);
    try {
      await onYes();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <div className="notice" style={{ margin: '10px 0 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ flex: 1 }}>{error || label}</span>
      <button className="small primary" onClick={yes} disabled={busy}>
        印刷済みにする
      </button>
      <button className="small" onClick={onDone} disabled={busy}>
        まだ
      </button>
    </div>
  );
}
