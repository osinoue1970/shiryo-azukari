import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDeposit, fmtDateTime, type Deposit } from '../db';

// 預かり・返却の登録が終わったことをはっきり伝える画面
export default function DonePage({ kind }: { kind: 'deposit' | 'return' }) {
  const { id, rid } = useParams();
  const [d, setD] = useState<Deposit | null>(null);
  useEffect(() => {
    getDeposit(id!).then(setD).catch(() => {});
  }, [id]);

  const r = kind === 'return' ? d?.deposit_returns.find((x) => x.id === rid) : undefined;
  const shipped = !!r && r.method !== 'hand';
  const names = d ? (r ? r.item_idx.map((i) => d.items[i]?.name) : d.items.map((i) => `${i.name}${i.qty ? `（${i.qty}）` : ''}`)) : [];

  return (
    <div className="narrow">
      <div className="card done-box">
        <div className="check">✓</div>
        <div className="title">{kind === 'deposit' ? '預かりを登録しました' : shipped ? '返却（発送）を登録しました' : '返却を登録しました'}</div>
        <div className="muted">
          {shipped ? '発送記録の写真とともに保存されました。' : d?.photos.length && kind === 'deposit' ? 'お客様のサインと写真とともに保存されました。' : 'お客様のサインとともに保存されました。'}
        </div>
        {d && (
          <div style={{ textAlign: 'left', marginTop: 18, background: 'var(--bg)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{d.client_name} 様</div>
            <div className="small-text muted">
              No.{d.no}　{fmtDateTime(r ? r.returned_at : d.received_at)}
            </div>
            <ul className="items" style={{ marginTop: 6 }}>
              {names.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="small-text muted" style={{ marginBottom: 0 }}>
          {kind === 'deposit' ? '貼付ラベル' : '返却確認書'}は、事務所のPCの「印刷待ち」から印刷します。
        </p>
      </div>
      <div className="actions" style={{ flexDirection: 'column' }}>
        <Link to="/new" className="btn primary block">
          ＋ 続けて資料を預かる
        </Link>
        <Link to="/" className="btn block">
          ホームへ戻る
        </Link>
      </div>
    </div>
  );
}
