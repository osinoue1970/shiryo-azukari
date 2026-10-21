import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import PrintedPrompt from '../PrintedPrompt';
import { waitForImages } from '../photos';
import { LabelPaper, ReturnPaper } from '../papers';
import { getDeposit, listDeposits, markPrinted, queueItems, fmtDateTime, type Deposit, type QueueItem } from '../db';

// iPhone で登録した貼付ラベル・返却確認書のうち、まだ印刷していないものを PC でまとめて印刷する
export default function PrintQueuePage({ onChanged }: { onChanged: () => void }) {
  const { settings, staff, scope } = useAuth();
  const myName = staff?.name ?? '';
  // 個人モード（一般職員は常にこちら）は自分の分を初期表示。氏名が未設定なら全員の分
  const initialMine = scope === 'mine' && !!myName;
  const [rows, setRows] = useState<Deposit[] | null>(null);
  const [onlyMine, setOnlyMine] = useState(initialMine);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState<Deposit[] | null>(null);
  const [printKeys, setPrintKeys] = useState<QueueItem[]>([]);
  const [askPrinted, setAskPrinted] = useState(false);
  const [error, setError] = useState('');
  const printAreaRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      setRows(await listDeposits());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => setOnlyMine(initialMine), [initialMine]);

  const allItems = useMemo(() => (rows ? queueItems(rows) : null), [rows]);
  const mineItems = useMemo(() => (rows ? queueItems(rows, myName) : null), [rows, myName]);
  const items = onlyMine ? mineItems : allItems;

  // 一覧が変わったら（読み込み・切替・印刷済み）いったん全部を選択状態にする
  useEffect(() => setSelected(new Set((items ?? []).map((x) => x.key))), [items]);

  const chosen = useMemo(() => (items ?? []).filter((x) => selected.has(x.key)), [items, selected]);

  const toggle = (key: string) => {
    const s = new Set(selected);
    if (s.has(key)) s.delete(key);
    else s.add(key);
    setSelected(s);
  };

  const mark = async (list: QueueItem[]) => {
    await markPrinted(
      list.filter((x) => x.kind === 'label').map((x) => x.deposit.id),
      list.filter((x) => x.kind === 'return').map((x) => x.ret!.id),
      myName,
    );
    await load();
    onChanged();
  };

  const printSelected = async () => {
    setError('');
    setAskPrinted(false);
    try {
      // 一覧はサイン画像を含まないため、印刷するものだけ詳細を取り直す
      const ids = [...new Set(chosen.map((x) => x.deposit.id))];
      const full = await Promise.all(ids.map((id) => getDeposit(id)));
      setPrintKeys(chosen);
      setPrinting(full);
      await waitForImages(printAreaRef.current!); // QRコード・写真の読み込みを待つ
      window.print();
      setAskPrinted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const fullById = new Map((printing ?? []).map((d) => [d.id, d]));
  const othersCount = (allItems?.length ?? 0) - (mineItems?.length ?? 0);

  return (
    <>
      <div className="no-print">
        <h1>印刷待ち</h1>
        <p className="muted small-text" style={{ marginTop: -8 }}>
          iPhoneで登録した資料の貼付ラベルと、返却時の返却確認書（どちらもB5）のうち、まだ印刷していないものです。
        </p>
        {myName && allItems && (
          <div className="chips">
            <button type="button" className={`chip ${onlyMine ? 'on' : ''}`} onClick={() => setOnlyMine(true)}>
              自分の分（{mineItems?.length ?? 0}）
            </button>
            <button type="button" className={`chip ${!onlyMine ? 'on' : ''}`} onClick={() => setOnlyMine(false)}>
              全員の分（{allItems.length}）
            </button>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        {!items && !error && <p className="muted">読み込み中…</p>}
        {items && !items.length && (
          <div className="card">
            {onlyMine ? '自分の印刷待ちはありません。' : '印刷待ちはありません。'}
            {onlyMine && othersCount > 0 && (
              <div className="small-text muted" style={{ marginTop: 6 }}>
                ほかの職員の印刷待ちが {othersCount} 件あります。「全員の分」で表示できます。
              </div>
            )}
          </div>
        )}

        {!!items?.length && (
          <>
            <div className="toolbar">
              <button className="primary" onClick={printSelected} disabled={!chosen.length}>
                🖨 選択した {chosen.length} 件を印刷
              </button>
              <button className="small" onClick={() => setSelected(new Set(selected.size === items.length ? [] : items.map((x) => x.key)))}>
                {selected.size === items.length ? '選択を解除' : 'すべて選択'}
              </button>
            </div>
            {askPrinted && (
              <div style={{ marginBottom: 12 }}>
                <PrintedPrompt
                  label={`${printKeys.length} 件を印刷できましたか？ 印刷済みにすると一覧から消えます。`}
                  onYes={() => mark(printKeys)}
                  onDone={() => setAskPrinted(false)}
                />
              </div>
            )}
            <table className="list" style={{ display: 'table' }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>種類</th>
                  <th>顧客名</th>
                  <th>番号</th>
                  <th>日時</th>
                  <th>担当</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.key}>
                    <td>
                      <input type="checkbox" checked={selected.has(x.key)} onChange={() => toggle(x.key)} style={{ width: 20, height: 20 }} />
                    </td>
                    <td>
                      <span className={`badge ${x.kind === 'label' ? 'kept' : 'returned'}`}>{x.kind === 'label' ? '貼付ラベル' : '返却確認書'}</span>
                    </td>
                    <td>
                      <Link to={`/d/${x.deposit.id}`}>{x.deposit.client_name}</Link>
                    </td>
                    <td>{x.deposit.no}</td>
                    <td>{fmtDateTime(x.at)}</td>
                    <td>{x.staff_name}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="small" onClick={() => mark([x])} title="印刷せずに一覧から外す">
                        印刷不要
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* 印刷用（画面には表示しない） */}
      <div className="print-area" ref={printAreaRef}>
        {printKeys.map((x) => {
          const d = fullById.get(x.deposit.id);
          if (!d) return null;
          if (x.kind === 'label') return <LabelPaper key={x.key} d={d} size="b5" officeName={settings.office_name} />;
          const r = d.deposit_returns.find((y) => y.id === x.ret!.id);
          return r ? <ReturnPaper key={x.key} d={d} r={r} officeName={settings.office_name} /> : null;
        })}
      </div>
    </>
  );
}
