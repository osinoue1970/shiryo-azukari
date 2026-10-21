import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import SignatureBox from '../SignatureBox';
import PhotoCapture, { photoPaths, photosBusy, photosFailed, type CapturedPhoto } from '../PhotoCapture';
import { ThumbGrid } from '../PhotoThumbs';
import { toHalfWidth } from '../inputs';
import { createReturn, getDeposit, listStaff, returnedIdx, fmtDateTime, METHOD_LABEL, type Deposit, type ReturnMethod } from '../db';

const METHOD_ICON: Record<ReturnMethod, string> = { hand: '🤝', courier: '🚚', post: '✉️' };

// 発送のときの種別（任意）
const CARRIERS: Record<Exclude<ReturnMethod, 'hand'>, string[]> = {
  courier: ['ヤマト運輸', '佐川急便', 'ゆうパック', 'その他'],
  post: ['普通郵便', '特定記録', '簡易書留', 'レターパック'],
};

const SHIP_TEXT: Record<Exclude<ReturnMethod, 'hand'>, { shoot: string; hint: string; need: string }> = {
  courier: { shoot: '伝票の控えを撮影する', hint: '追跡番号が読めるように撮影してください。', need: '伝票の控えを撮影してください。' },
  post: { shoot: '郵便物を撮影する', hint: '宛名が見えるように撮影してください。書留の場合は控えも撮影してください。', need: '郵便物の写真を撮影してください。' },
};

export default function ReturnPage() {
  const { id } = useParams();
  const { staff } = useAuth();
  const nav = useNavigate();
  const [d, setD] = useState<Deposit | null>(null);
  const [step, setStep] = useState<'form' | 'sign' | 'confirm'>('form');
  const [method, setMethod] = useState<ReturnMethod>('hand');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [recipient, setRecipient] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [staffName, setStaffName] = useState(staff?.name ?? '');
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    listStaff().then((s) => setStaffOptions(s.filter((x) => x.active && x.name).map((x) => x.name))).catch(() => {});
  }, []);

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
  const ship = method === 'hand' ? null : method;
  const uploading = photosBusy(photos);
  const failed = photosFailed(photos);
  // 発送で送り先を空にしたときは顧客名を送り先にする
  const recipientName = recipient.trim() || (ship ? d.client_name : '');

  const toggle = (i: number) => {
    const s = new Set(selected);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setSelected(s);
  };

  const pickMethod = (m: ReturnMethod) => {
    setMethod(m);
    setCarrier('');
    setError('');
  };

  // 入力欄の下のほうでボタンを押しても気づけるよう、エラーを出したら上に戻す
  const fail = (msg: string) => {
    setError(msg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!chosen.length) return fail('返却する資料を選んでください。');
    if (ship && !photos.length) return fail(SHIP_TEXT[ship].need);
    if (failed) return fail('送信できなかった写真があります。「再送」を押すか、✕で外してください。');
    if (!staffName.trim()) return fail('返却担当者を入力してください。');
    setNow(new Date());
    setSignature('');
    setStep(ship ? 'confirm' : 'sign');
    window.scrollTo(0, 0);
  };

  const save = async () => {
    if (!ship && !signature) return setError('サインをお願いします。');
    if (failed) return setError('送信できなかった写真があります。「戻る」から再送してください。');
    setBusy(true);
    setError('');
    try {
      const rid = await createReturn(d, {
        deposit_id: d.id,
        returned_at: new Date().toISOString(),
        staff_name: staffName.trim(),
        recipient: recipientName,
        item_idx: chosen,
        memo: memo.trim(),
        method,
        carrier: ship ? carrier : '',
        tracking_no: ship ? trackingNo.trim() : '',
        signature: ship ? '' : signature,
        photos: ship ? photoPaths(photos) : [],
      });
      nav(`/d/${d.id}/returned/${rid}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const itemList = (
    <ul className="items">
      {chosen.map((i) => (
        <li key={i}>
          {d.items[i].name}
          {d.items[i].qty && `　${d.items[i].qty}`}
        </li>
      ))}
    </ul>
  );

  if (step === 'sign') {
    return (
      <div className="narrow">
        <h1>受領のサイン</h1>
        <div className="card confirm-box">
          <div className="muted small-text">お預かりしていた以下の資料をお返しします。お受け取りの確認としてサインをお願いします。</div>
          <div className="big" style={{ margin: '8px 0' }}>{d.client_name} 様</div>
          {itemList}
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

  if (step === 'confirm' && ship) {
    return (
      <div className="narrow">
        <h1>発送の確認</h1>
        <div className="card confirm-box">
          <div className="muted small-text">以下の資料を{METHOD_LABEL[ship]}で返送した記録を登録します。登録後は変更できません。</div>
          <div className="big" style={{ margin: '8px 0' }}>{d.client_name} 様</div>
          {itemList}
          <div style={{ marginTop: 10 }}>
            <ThumbGrid srcs={photos.map((p) => p.preview || undefined)} large />
          </div>
          <div className="small-text" style={{ marginTop: 8 }}>
            返却方法：{METHOD_LABEL[ship]}
            {carrier && `（${carrier}）`}
            {trackingNo.trim() && `　追跡番号 ${trackingNo.trim()}`}
            <br />
            送り先：{recipientName}
            <br />
            返却日時：{fmtDateTime(now.toISOString())}
            <br />
            （預かり番号 {d.no}・{fmtDateTime(d.received_at)} 預かり分）
            <br />
            返却担当：{staffName}
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="actions">
          <button onClick={() => setStep('form')} disabled={busy}>
            戻る
          </button>
          <button className="ok" style={{ flex: 1 }} onClick={save} disabled={busy || uploading}>
            {busy ? '保存中…' : uploading ? '写真を送信中…' : 'この内容で返却を確定'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="narrow" onSubmit={next}>
      <h1>資料を返却する</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        {d.client_name}　No.{d.no}（{fmtDateTime(d.received_at)} 預かり）
      </p>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <h2>返却方法</h2>
        <div className="method-pick" role="radiogroup" aria-label="返却方法">
          {(['hand', 'courier', 'post'] as const).map((m) => (
            <button type="button" key={m} role="radio" aria-checked={method === m} className={method === m ? 'on' : ''} onClick={() => pickMethod(m)}>
              <span className="method-icon" aria-hidden>
                {METHOD_ICON[m]}
              </span>
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
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
      {ship && (
        <div className="card">
          <h2>
            発送の記録<span className="req" style={{ color: 'var(--danger)' }}>*</span>
          </h2>
          <PhotoCapture depositId={d.id} kind="return" photos={photos} setPhotos={setPhotos} shootLabel={SHIP_TEXT[ship].shoot} hint={SHIP_TEXT[ship].hint} />
          <div className="field" style={{ marginTop: 14 }}>
            <span>種別（任意）</span>
            <div className="chips" style={{ marginBottom: 0 }}>
              {CARRIERS[ship].map((c) => (
                <button type="button" key={c} className={`chip ${carrier === c ? 'on' : ''}`} onClick={() => setCarrier(carrier === c ? '' : c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>追跡番号（任意）</span>
            <input value={trackingNo} inputMode="numeric" onChange={(e) => setTrackingNo(toHalfWidth(e.target.value))} placeholder="例：1234-5678-9012" />
          </label>
        </div>
      )}
      <div className="card">
        <label className="field">
          <span>{ship ? '送り先（宛名）' : '受け取る方の氏名'}</span>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={ship ? d.client_name : '例：山田太郎'} />
        </label>
        <label className="field">
          <span>
            返却担当者<span className="req">*</span>
          </span>
          <input list="return-staff" value={staffName} onChange={(e) => setStaffName(e.target.value)} required />
          <datalist id="return-staff">
            {staffOptions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>メモ</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
      </div>
      <button className="ok block">{ship ? '次へ（発送の内容を確認）' : '次へ（お客様に受領サインをもらう）'}</button>
    </form>
  );
}
