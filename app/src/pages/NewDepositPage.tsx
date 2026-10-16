import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import SignatureBox from '../SignatureBox';
import { DatePickField, QtyInput } from '../inputs';
import { clientNames, createDeposit, listStaff, fmtDateTime, type DocItem } from '../db';

const ITEM_PRESETS = ['通帳', '領収書綴り', '請求書綴り', '現金出納帳', '売上帳', '仕入帳', '給与台帳', '源泉徴収票', '固定資産台帳', '契約書', '決算書・申告書控え', '保険料控除証明書', '医療費領収書', '印鑑'];
const PURPOSE_PRESETS = ['決算', '確定申告', '年末調整', '月次記帳', '相続', '税務調査対応', 'その他'];

export default function NewDepositPage() {
  const { staff } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState<'form' | 'sign'>('form');
  const [clientName, setClientName] = useState('');
  const [handedBy, setHandedBy] = useState('');
  const [items, setItems] = useState<DocItem[]>([{ name: '', qty: '1' }]);
  const [purpose, setPurpose] = useState('');
  const [staffName, setStaffName] = useState(staff?.name ?? '');
  const [location, setLocation] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [memo, setMemo] = useState('');
  const [signature, setSignature] = useState('');
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    listStaff().then((s) => setStaffOptions(s.filter((x) => x.active && x.name).map((x) => x.name))).catch(() => {});
    clientNames().then(setClients).catch(() => {});
  }, []);

  const filledItems = items.filter((i) => i.name.trim());

  const setItem = (idx: number, patch: Partial<DocItem>) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addPreset = (name: string) => {
    const blank = items.findIndex((i) => !i.name.trim());
    if (blank >= 0) setItem(blank, { name });
    else setItems([...items, { name, qty: '1' }]);
  };

  const toSign = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!filledItems.length) return setError('預かる資料を1つ以上入力してください。');
    if (!staffName.trim()) return setError('担当者を入力してください。');
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
      const id = await createDeposit({
        client_name: clientName.trim(),
        handed_by: handedBy.trim(),
        items: filledItems.map((i) => ({ name: i.name.trim(), qty: i.qty.trim() })),
        purpose,
        received_at: new Date().toISOString(),
        staff_name: staffName.trim(),
        location: location.trim(),
        expected_return: expectedReturn || null,
        memo: memo.trim(),
        signature,
      });
      nav(`/d/${id}/done`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (step === 'sign') {
    return (
      <div className="narrow">
        <h1>お客様のサイン</h1>
        <div className="card confirm-box">
          <div className="muted small-text">以下の資料をお預かりします。内容をご確認のうえ、サインをお願いします。</div>
          <div className="big" style={{ margin: '8px 0' }}>{clientName} 様</div>
          <ul className="items">
            {filledItems.map((i, idx) => (
              <li key={idx}>
                {i.name}
                {i.qty && `　${i.qty}`}
              </li>
            ))}
          </ul>
          <div className="small-text" style={{ marginTop: 8 }}>
            預かり日時：{fmtDateTime(now.toISOString())}
            <br />
            担当：{staffName}
            {purpose && `　用途：${purpose}`}
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <SignatureBox onChange={setSignature} label={`${handedBy || clientName} 様 サイン`} />
        <div className="actions" style={{ marginTop: 14 }}>
          <button onClick={() => setStep('form')} disabled={busy}>
            戻る
          </button>
          <button className="primary" style={{ flex: 1 }} onClick={save} disabled={busy || !signature}>
            {busy ? '保存中…' : 'サインして預かりを確定'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="narrow" onSubmit={toSign}>
      <h1>資料を預かる</h1>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <label className="field">
          <span>
            顧客名<span className="req">*</span>
          </span>
          <input list="clients" value={clientName} onChange={(e) => setClientName(e.target.value)} required placeholder="株式会社〇〇 / 山田太郎" />
          <datalist id="clients">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>資料を持参した方の氏名</span>
          <input value={handedBy} onChange={(e) => setHandedBy(e.target.value)} placeholder="例：経理担当 鈴木様" />
        </label>
      </div>

      <div className="card">
        <h2>預かる資料<span className="req" style={{ color: 'var(--danger)' }}>*</span></h2>
        <div className="chips">
          {ITEM_PRESETS.map((p) => (
            <button type="button" key={p} className="chip" onClick={() => addPreset(p)}>
              ＋{p}
            </button>
          ))}
        </div>
        {items.map((it, idx) => (
          <div className="item-row" key={idx}>
            <input value={it.name} onChange={(e) => setItem(idx, { name: e.target.value })} placeholder="資料名（例：〇〇銀行 普通預金通帳）" />
            <QtyInput value={it.qty} onChange={(qty) => setItem(idx, { qty })} />
            <button type="button" className="small" onClick={() => setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : [{ name: '', qty: '1' }])} aria-label="削除">
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="small" onClick={() => setItems([...items, { name: '', qty: '1' }])}>
          ＋ 行を追加
        </button>
      </div>

      <div className="card">
        <label className="field">
          <span>用途</span>
          <div className="chips">
            {PURPOSE_PRESETS.map((p) => (
              <button type="button" key={p} className={`chip ${purpose === p ? 'on' : ''}`} onClick={() => setPurpose(purpose === p ? '' : p)}>
                {p}
              </button>
            ))}
          </div>
        </label>
        <label className="field">
          <span>
            担当者<span className="req">*</span>
          </span>
          <input list="staff" value={staffName} onChange={(e) => setStaffName(e.target.value)} required />
          <datalist id="staff">
            {staffOptions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <div className="field">
          <span>返却予定日</span>
          <DatePickField value={expectedReturn} onChange={setExpectedReturn} />
        </div>
        <label className="field">
          <span>保管場所</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例：2F書庫 B棚" />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>メモ</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
      </div>

      <button className="primary block">次へ（お客様にサインをもらう）</button>
    </form>
  );
}
