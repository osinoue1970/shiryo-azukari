import { useState, type RefObject } from 'react';
import { useAuth } from './auth';
import { elementToPdf, savePdf, sendPdfMail, type PaperSize } from './pdf';
import { waitForImages } from './photos';
import PrintedPrompt from './PrintedPrompt';

// 用紙の印刷（PC）・PDF保存・メール送信の操作バー。
// メール送信欄は、設定で送信先が登録されているときだけ表示する。
export default function PdfActions({
  paperRef,
  size,
  filename,
  subject,
  text,
  onPrinted,
}: {
  paperRef: RefObject<HTMLDivElement | null>;
  size: PaperSize;
  filename: string;
  subject: string;
  text: string;
  onPrinted?: () => Promise<void>;
}) {
  const { settings } = useAuth();
  const [to, setTo] = useState(settings.pdf_email);
  const [busy, setBusy] = useState<'' | 'mail' | 'save'>('');
  const [askPrinted, setAskPrinted] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const run = async (kind: 'mail' | 'save') => {
    if (!paperRef.current) return;
    setBusy(kind);
    setMsg('');
    setError('');
    try {
      await waitForImages(paperRef.current);
      const pdf = await elementToPdf(paperRef.current, size);
      if (kind === 'mail') {
        await sendPdfMail({ to: to.trim(), subject, text, filename, pdf });
        setMsg(`${to.trim()} にPDFを送信しました。`);
      } else {
        await savePdf(pdf, filename);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const print = async () => {
    if (paperRef.current) await waitForImages(paperRef.current);
    window.print();
    if (onPrinted) setAskPrinted(true);
  };

  return (
    <div className="card no-print" style={{ marginBottom: 16 }}>
      <div className="actions">
        <button className="primary" onClick={print} disabled={!!busy}>
          🖨 印刷する
        </button>
        <button onClick={() => run('save')} disabled={!!busy}>
          {busy === 'save' ? '作成中…' : 'PDFを保存'}
        </button>
      </div>
      <p className="small-text muted" style={{ margin: '8px 0 0' }}>
        PCから事務所のプリンタで印刷できます。iPhoneで登録したものは、PCの「印刷待ち」にも並びます。
      </p>
      {settings.pdf_email && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="送信先メールアドレス" style={{ flex: '1 1 220px' }} />
          <button style={{ flex: '0 0 auto' }} onClick={() => run('mail')} disabled={!!busy || !/^\S+@\S+\.\S+$/.test(to.trim())}>
            {busy === 'mail' ? '送信中…' : '✉ PDFをメールで送る'}
          </button>
        </div>
      )}
      {askPrinted && onPrinted && <PrintedPrompt onYes={onPrinted} onDone={() => setAskPrinted(false)} />}
      {msg && <div className="notice" style={{ margin: '10px 0 0' }}>{msg}</div>}
      {error && <div className="error" style={{ margin: '10px 0 0' }}>{error}</div>}
    </div>
  );
}
