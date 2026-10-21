import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import SignatureBox from '../SignatureBox';
import PhotoCapture, { photoPaths, photosBusy, photosFailed, type CapturedPhoto } from '../PhotoCapture';
import { ThumbGrid } from '../PhotoThumbs';
import { DatePickField, QtyInput } from '../inputs';
import { clientNames, createDeposit, listStaff, fmtDateTime, newId, type DocItem } from '../db';

const ITEM_PRESETS = ['通帳', '領収書綴り', '請求書綴り', '現金出納帳', '売上帳', '仕入帳', '給与台帳', '源泉徴収票', '固定資産台帳', '契約書', '決算書・申告書控え', '保険料控除証明書', '医療費領収書', '印鑑'];
const PURPOSE_PRESETS = ['決算', '確定申告', '年末調整', '月次記帳', '相続', '税務調査対応', 'その他'];

export default function NewDepositPage() {
  const { staff } = useAuth();
  const nav = useNavigate();
  // 写真を撮った時点で送信を始めるため、預かりの id は先に決めておく
  const [depositId] = useState(newId);
  const [step, setStep] = useState<'form' | 'sign'>('form');
  const [clientName, setClientName] = useState('');
  const [handedBy, setHandedBy] = useState('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [items, setItems] = useState<DocItem[]>([{ name: '', qty: '1' }]);
  const [showItems, setShowItems] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [staffName, setStaffName] = useState(staff?.name ?? '');
  const [editStaff, setEditStaff] = useState(!staff?.name);
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
  // 写真だけで預かるときは「資料一式」の1件にする（返却はまとめて1回）
  const finalItems: DocItem[] = filledItems.length
    ? filledItems.map((i) => ({ name: i.name.trim(), qty: i.qty.trim() }))
    : [{ name: `資料一式（写真${photos.length}枚）`, qty: '' }];
  // 写真がないときは資料名の入力欄を最初から開いておく
  const itemsOpen = !photos.length || showItems || filledItems.length > 0;
  const uploading = photosBusy(photos);
  const failed = photosFailed(photos);

  const setItem = (idx: number, patch: Partial<DocItem>) => setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addPreset = (name: string) => {
    const blank = items.findIndex((i) => !i.name.trim());
    if (blank >= 0) setItem(blank, { name });
    else setItems([...items, { name, qty: '1' }]);
  };

  // 入力欄の下のほうでボタンを押しても気づけるよう、エラーを出したら上に戻す
  const fail = (msg: string) => {
    setError(msg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toSign = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!filledItems.length && !photos.length) return fail('資料を撮影するか、資料名を入力してください。');
    if (failed) return fail('送信できなかった写真があります。「再送」を押すか、✕で外してください。');
    if (!staffName.trim()) {
      setEditStaff(true);
      return fail('担当者を入力してください。');
    }
    setNow(new Date());
    setSignature('');
    setStep('sign');
    window.scrollTo(0, 0);
  };

  const save = async () => {
    if (!signature) return setError('サインをお願いします。');
    if (failed) return setError('送信できなかった写真があります。「戻る」から再送してください。');
    setBusy(true);
    setError('');
    try {
      const id = await createDeposit({
        id: depositId,
        client_name: clientName.trim(),
        handed_by: handedBy.trim(),
        items: finalItems,
        purpose,
        received_at: new Date().toISOString(),
        staff_name: staffName.trim(),
        location: location.trim(),
        expected_return: expectedReturn || null,
        memo: memo.trim(),
        signature,
        photos: photoPaths(photos),
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
            {finalItems.map((i, idx) => (
              <li key={idx}>
                {i.name}
                {i.qty && `　${i.qty}`}
              </li>
            ))}
          </ul>
          {photos.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <ThumbGrid srcs={photos.map((p) => p.preview || undefined)} large />
            </div>
          )}
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
          <button className="primary" style={{ flex: 1 }} onClick={save} disabled={busy || uploading || !signature}>
            {busy ? '保存中…' : uploading ? '写真を送信中…' : 'サインして預かりを確定'}
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
        <label className="field" style={{ marginBottom: 0 }}>
          <span>資料を持参した方の氏名</span>
          <input value={handedBy} onChange={(e) => setHandedBy(e.target.value)} placeholder="例：経理担当 鈴木様" />
        </label>
      </div>

      <div className="card">
        <h2>預かる資料<span className="req" style={{ color: 'var(--danger)' }}>*</span></h2>
        <PhotoCapture
          depositId={depositId}
          kind="receive"
          photos={photos}
          setPhotos={setPhotos}
          shootLabel="資料を撮影する"
          hint="資料を並べて撮るだけで登録できます。資料名の入力は不要です。"
        />
        {itemsOpen ? (
          <div style={{ marginTop: photos.length ? 16 : 14 }}>
            {photos.length > 0 && <div className="small-text muted" style={{ marginBottom: 8 }}>資料名（任意）：入力した資料は1点ずつ返却できます</div>}
            {!photos.length && <div className="small-text muted" style={{ marginBottom: 8 }}>または資料名を入力</div>}
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
        ) : (
          <button type="button" className="link-btn" onClick={() => setShowItems(true)}>
            ▸ 資料名も入力する（任意・1点ずつ返却したいとき）
          </button>
        )}
      </div>

      <div className="card">
        <div className="field">
          <span>用途</span>
          <div className="chips" style={{ marginBottom: 0 }}>
            {PURPOSE_PRESETS.map((p) => (
              <button type="button" key={p} className={`chip ${purpose === p ? 'on' : ''}`} onClick={() => setPurpose(purpose === p ? '' : p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {editStaff ? (
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
        ) : (
          <div className="staff-line">
            担当：<strong>{staffName}</strong>
            <button type="button" className="small" onClick={() => setEditStaff(true)}>
              変更
            </button>
          </div>
        )}
        <details className="more">
          <summary>その他の項目（返却予定日・保管場所・メモ）</summary>
          <p className="small-text muted" style={{ marginTop: 0 }}>あとから詳細画面で変更できます。</p>
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
        </details>
      </div>

      <button className="primary block">次へ（お客様にサインをもらう）</button>
    </form>
  );
}
