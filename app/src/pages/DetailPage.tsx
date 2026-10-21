import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DatePickField } from '../inputs';
import PhotoThumbs from '../PhotoThumbs';
import { getDeposit, updateDepositNotes, statusOf, STATUS_LABEL, returnedIdx, returnMethodText, daysSince, fmtDateTime, fmtDate, type Deposit } from '../db';

export default function DetailPage() {
  const { id } = useParams();
  const [d, setD] = useState<Deposit | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState({ location: '', expected_return: '', memo: '' });

  const load = () =>
    getDeposit(id!)
      .then((x) => {
        setD(x);
        setNotes({ location: x.location, expected_return: x.expected_return ?? '', memo: x.memo });
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!d) return <p className="muted">読み込み中…</p>;

  const status = statusOf(d);
  const done = returnedIdx(d);

  const saveNotes = async () => {
    try {
      await updateDepositNotes(d.id, { location: notes.location, expected_return: notes.expected_return || null, memo: notes.memo });
      setEditing(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="narrow">
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>{d.client_name}</h1>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>
        </div>
      </div>

      <div className="actions" style={{ marginBottom: 14 }}>
        <Link className="btn pc-only" to={`/d/${d.id}/label`}>
          🏷 貼付ラベル（PDF）
        </Link>
        <Link className="btn pc-only" to={`/d/${d.id}/receipt`}>
          📄 預り証（PDF）
        </Link>
        {status !== 'returned' && (
          <Link className="btn ok" to={`/d/${d.id}/return`}>
            ↩ 返却する
          </Link>
        )}
      </div>

      <div className="card">
        <h2>預かり内容　<span className="muted small-text">No.{d.no}</span></h2>
        <dl className="kv">
          <dt>資料</dt>
          <dd>
            <ul className="items">
              {d.items.map((i, idx) => (
                <li key={idx} className={done.has(idx) ? 'done' : ''}>
                  {i.name}
                  {i.qty && `　${i.qty}`}
                  {done.has(idx) && '（返却済）'}
                </li>
              ))}
            </ul>
          </dd>
          <dt>預かり日時</dt>
          <dd>
            {fmtDateTime(d.received_at)}（{daysSince(d.received_at)}日経過）
          </dd>
          <dt>持参者</dt>
          <dd>{d.handed_by || '—'}</dd>
          <dt>担当者</dt>
          <dd>{d.staff_name}</dd>
          <dt>用途</dt>
          <dd>{d.purpose || '—'}</dd>
          {d.photos.length > 0 && (
            <>
              <dt>写真</dt>
              <dd>
                <PhotoThumbs paths={d.photos} />
              </dd>
            </>
          )}
          <dt>お客様サイン</dt>
          <dd>
            <img className="sig-img" src={d.signature} alt="預かり時サイン" />
          </dd>
        </dl>
        {d.hash && <div className="hash" style={{ marginTop: 8 }}>照合コード：{d.hash.slice(0, 16)}</div>}
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>保管情報</h2>
          <div style={{ textAlign: 'right' }}>
            {!editing && (
              <button className="small" onClick={() => setEditing(true)}>
                編集
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <>
            <label className="field">
              <span>保管場所</span>
              <input value={notes.location} onChange={(e) => setNotes({ ...notes, location: e.target.value })} />
            </label>
            <div className="field">
              <span>返却予定日</span>
              <DatePickField value={notes.expected_return} onChange={(v) => setNotes({ ...notes, expected_return: v })} />
            </div>
            <label className="field">
              <span>メモ</span>
              <textarea value={notes.memo} onChange={(e) => setNotes({ ...notes, memo: e.target.value })} />
            </label>
            <div className="actions">
              <button onClick={() => setEditing(false)}>キャンセル</button>
              <button className="primary" onClick={saveNotes}>
                保存
              </button>
            </div>
          </>
        ) : (
          <dl className="kv">
            <dt>保管場所</dt>
            <dd>{d.location || '—'}</dd>
            <dt>返却予定日</dt>
            <dd>{fmtDate(d.expected_return) || '—'}</dd>
            <dt>メモ</dt>
            <dd>{d.memo || '—'}</dd>
          </dl>
        )}
        <p className="small-text muted" style={{ marginBottom: 0 }}>
          ※ 署名済みの預かり内容（資料・日時・サイン）は変更できません。
        </p>
      </div>

      <div className="card">
        <h2>返却履歴</h2>
        {!d.deposit_returns.length && <p className="muted" style={{ margin: 0 }}>まだ返却されていません。</p>}
        {d.deposit_returns.map((r) => (
          <div key={r.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
            <dl className="kv">
              <dt>返却日時</dt>
              <dd>{fmtDateTime(r.returned_at)}</dd>
              <dt>返却資料</dt>
              <dd>{r.item_idx.map((i) => d.items[i]?.name).join('、')}</dd>
              <dt>返却方法</dt>
              <dd>{returnMethodText(r)}</dd>
              <dt>{r.method === 'hand' ? '受領者' : '送り先'}</dt>
              <dd>{r.recipient || '—'}</dd>
              <dt>返却担当</dt>
              <dd>{r.staff_name}</dd>
              {r.memo && (
                <>
                  <dt>メモ</dt>
                  <dd>{r.memo}</dd>
                </>
              )}
              {r.method === 'hand' ? (
                <>
                  <dt>受領サイン</dt>
                  <dd>
                    <img className="sig-img" src={r.signature} alt="返却時サイン" />
                  </dd>
                </>
              ) : (
                <>
                  <dt>発送記録</dt>
                  <dd>
                    <PhotoThumbs paths={r.photos} />
                  </dd>
                </>
              )}
            </dl>
            <div className="row" style={{ marginTop: 8 }}>
              {r.hash && <div className="hash">照合コード：{r.hash.slice(0, 16)}</div>}
              <div style={{ textAlign: 'right' }}>
                <Link className="btn small pc-only" to={`/d/${d.id}/returns/${r.id}`}>
                  📄 返却確認書（PDF）
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
