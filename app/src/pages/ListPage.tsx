import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { listDeposits, statusOf, STATUS_LABEL, daysSince, fmtDate, returnedIdx, returnMethodText, isMine, type Deposit } from '../db';

type Filter = 'open' | 'long' | 'overdue' | 'returned' | 'all';

// 担当者セレクトの「自分」を表す値（職員名と重ならないようにする）
const ME = '__me__';

export default function ListPage() {
  const { settings, staff: me, scope } = useAuth();
  const nav = useNavigate();
  const myName = me?.name ?? '';
  // 個人モード（一般職員は常にこちら）は自分の担当分を初期表示。氏名が未設定なら絞り込めないので「すべて」
  const initialStaff = scope === 'mine' && myName ? ME : '';
  const [rows, setRows] = useState<Deposit[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [q, setQ] = useState('');
  const [staff, setStaff] = useState(initialStaff);

  useEffect(() => {
    listDeposits().then(setRows).catch((e) => setError(e.message));
  }, []);
  useEffect(() => setStaff(initialStaff), [initialStaff]);

  const today = new Date().toISOString().slice(0, 10);
  const isOpen = (d: Deposit) => statusOf(d) !== 'returned';
  const isLong = (d: Deposit) => isOpen(d) && daysSince(d.received_at) >= settings.long_term_days;
  const isOverdue = (d: Deposit) => isOpen(d) && !!d.expected_return && d.expected_return < today;
  const matchesStaff = (d: Deposit) => (staff === ME ? isMine(d, myName) : !staff || d.staff_name === staff);

  const kw = q.trim().toLowerCase();
  // 検索中は担当者の絞り込みを外し、全員分から探す（他の人が預かった資料を返却するときのため）
  const base = useMemo(() => (rows ?? []).filter((d) => kw || matchesStaff(d)), [rows, staff, kw, myName]);

  const counts = useMemo(
    () => ({
      open: base.filter(isOpen).length,
      long: base.filter(isLong).length,
      overdue: base.filter(isOverdue).length,
      returned: base.filter((d) => !isOpen(d)).length,
    }),
    [base, settings.long_term_days],
  );

  const staffNames = useMemo(() => [...new Set((rows ?? []).map((d) => d.staff_name))].filter((s) => s !== myName).sort(), [rows, myName]);

  const shown = useMemo(
    () =>
      base.filter((d) => {
        if (filter === 'open' && !isOpen(d)) return false;
        if (filter === 'long' && !isLong(d)) return false;
        if (filter === 'overdue' && !isOverdue(d)) return false;
        if (filter === 'returned' && isOpen(d)) return false;
        if (!kw) return true;
        const hay = [d.no, d.client_name, d.handed_by, d.purpose, d.location, d.memo, ...d.items.map((i) => i.name)].join(' ').toLowerCase();
        return hay.includes(kw);
      }),
    [base, filter, kw, settings.long_term_days],
  );

  const exportCsv = () => {
    const head = ['預かり番号', '状態', '顧客名', '持参者', '資料', '用途', '預かり日', '経過日数', '担当者', '保管場所', '返却予定日', '最終返却日', '返却受領者', '返却方法', 'メモ'];
    const lines = shown.map((d) => {
      const last = d.deposit_returns.at(-1);
      return [
        d.no,
        STATUS_LABEL[statusOf(d)],
        d.client_name,
        d.handed_by,
        d.items.map((i) => `${i.name}${i.qty ? `×${i.qty}` : ''}`).join(' / '),
        d.purpose,
        fmtDate(d.received_at),
        String(daysSince(d.received_at)),
        d.staff_name,
        d.location,
        fmtDate(d.expected_return),
        last ? fmtDate(last.returned_at) : '',
        last?.recipient ?? '',
        last ? returnMethodText(last) : '',
        d.memo,
      ];
    });
    const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `預かり資料一覧_${today}.csv`;
    a.click();
  };

  const badges = (d: Deposit) => {
    const s = statusOf(d);
    return (
      <>
        <span className={`badge ${s}`}>{STATUS_LABEL[s]}</span>{' '}
        {isLong(d) && <span className="badge long">長期</span>}{' '}
        {isOverdue(d) && <span className="badge long">返却予定超過</span>}
      </>
    );
  };

  const itemsText = (d: Deposit) => {
    const done = returnedIdx(d);
    return d.items.map((i, idx) => (done.has(idx) ? `(返)${i.name}` : i.name)).join('、');
  };

  const stat = (f: Filter, n: number, l: string) => (
    <div className={`stat ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  );

  return (
    <>
      <div className="stats">
        {stat('open', counts.open, '預かり中')}
        {stat('long', counts.long, `長期（${settings.long_term_days}日以上）`)}
        {stat('overdue', counts.overdue, '返却予定日超過')}
        {stat('returned', counts.returned, '返却済')}
      </div>

      <div className="toolbar">
        <input placeholder="顧客名・資料名・番号で検索" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={staff} onChange={(e) => setStaff(e.target.value)} style={{ maxWidth: 200 }}>
          {myName && <option value={ME}>担当者：自分（{myName}）</option>}
          <option value="">担当者：すべて</option>
          {staffNames.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ maxWidth: 180 }}>
          <option value="open">預かり中</option>
          <option value="long">長期</option>
          <option value="overdue">返却予定超過</option>
          <option value="returned">返却済</option>
          <option value="all">すべて</option>
        </select>
        <button className="small" onClick={exportCsv} disabled={!shown.length}>
          CSV出力
        </button>
      </div>

      {kw && staff && <p className="small-text muted" style={{ marginTop: -6 }}>検索中は担当者に関係なく全員分から探しています。</p>}
      {!myName && (
        <p className="small-text muted" style={{ marginTop: -6 }}>
          <Link to="/settings">設定</Link>で氏名を登録すると、自分の担当分だけを表示できます。
        </p>
      )}

      {error && <div className="error">{error}</div>}
      {!rows && !error && <p className="muted">読み込み中…</p>}
      {rows && !shown.length && <p className="muted">該当する資料はありません。</p>}

      {!!shown.length && (
        <>
          <table className="list">
            <thead>
              <tr>
                <th>番号</th>
                <th>状態</th>
                <th>顧客名</th>
                <th>資料</th>
                <th>預かり日</th>
                <th>経過</th>
                <th>担当</th>
                <th>保管場所</th>
                <th>返却予定</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id} className="clickable" onClick={() => nav(`/d/${d.id}`)}>
                  <td>{d.no}</td>
                  <td>{badges(d)}</td>
                  <td>
                    <strong>{d.client_name}</strong>
                    {d.purpose && <div className="small-text muted">{d.purpose}</div>}
                  </td>
                  <td>{itemsText(d)}</td>
                  <td>{fmtDate(d.received_at)}</td>
                  <td>{daysSince(d.received_at)}日</td>
                  <td>{d.staff_name}</td>
                  <td>{d.location}</td>
                  <td>{fmtDate(d.expected_return)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="cards">
            {shown.map((d) => (
              <Link key={d.id} to={`/d/${d.id}`} className="dcard">
                <div className="top">
                  <span className="small-text muted">No.{d.no}</span>
                  <span>{badges(d)}</span>
                </div>
                <div className="client">{d.client_name}</div>
                <div className="small-text">{itemsText(d)}</div>
                <div className="small-text muted" style={{ marginTop: 4 }}>
                  {fmtDate(d.received_at)}（{daysSince(d.received_at)}日）・{d.staff_name}
                  {d.location && `・${d.location}`}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {rows && staff === ME && !kw && (
        <p className="small-text muted" style={{ marginTop: 16 }}>
          自分の担当分（自分が預かった資料と、自分が返却した資料）のみ表示しています。他の人が預かった資料を返却するときは、上の検索欄で顧客名を探すか、資料に貼ったラベルのQRコードを読み取ってください。
        </p>
      )}
    </>
  );
}
