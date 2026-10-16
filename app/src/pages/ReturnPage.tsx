import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import SignatureBox from '../SignatureBox';
import { createReturn, getDeposit, returnedIdx, fmtDateTime, type Deposit } from '../db';

export default function ReturnPage() {
  const { id } = useParams();
  const { staff } = useAuth();
  const nav = useNavigate();
  const [d, setD] = useState<Deposit | null>(null);
  const [step, setStep] = useState<'form' | 'sign'>('form');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [recipient, setRecipient] = useState('');
  const [staffName, setStaffName] = useState(staff?.name ?? '');
  const [memo, setMemo] = useState('');
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    getDeposit(id!)
      .then((x) => {
        setD(x);
        const done = returnedIdx(x);
        setSelected(new Set(x.items.map((_, i) => i).filter((i) => !done.has(i))));
        setRecipient(x.handed_by);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error && !d) return <div className="error">{error}</div>;
  if (!d) return <p className="muted">読み込み中…</p>;

  const done = returnedIdx(d);
  const pending = d.items.map((_, i) => i).filter((i) => !done.has(i));
  const chosen = pending.filter((i) => selected.has(i));

  const toggle = (i: number) => {
    const s = new Set(selected);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setSelected(s);
  };

  const toSign = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!chosen.length) return setError('返却する資料を選んでください。');
    if (!staffName.trim()) return setError('返却担当者を入力してください。');
    setNow(new Date());
    setSignature('');
    setStep('sign');
    window.scrollTo(0, 0);
  };

  const save = async () => {
    if (!signature) return setError('サインをお願いします。');
    setBusy(true);
    setError('');
    try {
      const rid = await createReturn(d, {
        deposit_id: d.id,
        returned_at: new Date().toISOString(),
        staff_name: staffName.trim(),
        recipient: recipient.trim(),
        item_idx: chosen,
        memo: memo.trim(),
        signature,
      });
      nav(`/d/${d.id}/returned/${rid}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (step === 'sign') {
    return (
      <div className="narrow">
        <h1>受領のサイン</h1>
        <div className="card confirm-box">
          <div className="muted small-text">お預かりしていた以下の資料をお返しします。お受け取りの確認としてサインをお願いします。</div>
          <div className="big" style={{ margin: '8px 0' }}>{d.client_name} 様</div>
          <ul className="items">
            {chosen.map((i) => (
              <li key={i}>
                {d.items[i].name}
                {d.items[i].qty && `　${d.items[i].qty}`}
              </li>
            ))}
          </ul>
          <div className="small-text" style={{ marginTop: 8 }}>
            返却日時：{fmtDateTime(now.toISOString())}
            <br />
            （預かり番号 {d.no}・{fmtDateTime(d.received_at)} 預かり分）
            <br />
            返却担当：{staffName}
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <SignatureBox onChange={setSignature} label={`${recipient || d.client_name} 様 受領サイン`} />
        <div className="actions" style={{ marginTop: 14 }}>
          <button onClick={() => setStep('form')} disabled={busy}>
            戻る
          </button>
          <button className="ok" style={{ flex: 1 }} onClick={save} disabled={busy || !signature}>
            {busy ? '保存中…' : 'サインして返却を確定'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="narrow" onSubmit={toSign}>
      <h1>資料を返却する</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        {d.client_name}　No.{d.no}（{fmtDateTime(d.received_at)} 預かり）
      </p>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <h2>返却する資料</h2>
        {pending.map((i) => (
          <label key={i} className="check-item">
            <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
            <span>
              {d.items[i].name}
              {d.items[i].qty && `　${d.items[i].qty}`}
            </span>
          </label>
        ))}
        {[...done].map((i) => (
          <div key={i} className="check-item muted">
            <input type="checkbox" checked disabled />
            <span>{d.items[i]?.name}（返却済）</span>
          </div>
        ))}
      </div>
      <div className="card">
        <label className="field">
          <span>受け取る方の氏名</span>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="例：山田太郎" />
        </label>
        <label className="field">
          <span>
            返却担当者<span className="req">*</span>
          </span>
          <input value={staffName} onChange={(e) => setStaffName(e.target.value)} required />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>メモ（郵送・手渡し等）</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
      </div>
      <button className="ok block">次へ（お客様に受領サインをもらう）</button>
    </form>
  );
}
