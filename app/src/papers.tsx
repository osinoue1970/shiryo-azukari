import { useEffect, useState, type Ref } from 'react';
import QRCode from 'qrcode';
import { PAPER_MM, type PaperSize } from './pdf';
import { returnedIdx, fmtDate, fmtDateTime, type Deposit, type ReturnEvent } from './db';

// 貼付ラベル・預り証・返却確認書の用紙レイアウト。画面表示・PDF化・印刷で共通に使う。

const LABEL_BASE_PT: Record<PaperSize, number> = { a5: 12, b5: 14, a4: 16 };
const cell: React.CSSProperties = { border: '1px solid #000', padding: '4px 7px', verticalAlign: 'top' };
const head: React.CSSProperties = { ...cell, background: '#eee', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' };

function paperStyle(size: PaperSize): React.CSSProperties {
  return { width: `${PAPER_MM[size].w}mm`, minHeight: `${PAPER_MM[size].h}mm`, boxSizing: 'border-box' };
}

function useQr(d: Deposit) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(`${location.origin}${location.pathname}#/d/${d.id}`, { margin: 0, width: 400 }).then(setQr);
  }, [d.id]);
  return qr;
}

export function LabelPaper({ d, size, officeName, ref }: { d: Deposit; size: PaperSize; officeName: string; ref?: Ref<HTMLDivElement> }) {
  const qr = useQr(d);
  const base = LABEL_BASE_PT[size];
  const done = returnedIdx(d);
  const pending = d.items.map((it, i) => ({ ...it, i })).filter((x) => !done.has(x.i));
  const maxLines = size === 'a4' ? 14 : size === 'b5' ? 11 : 9;
  const shown = pending.slice(0, maxLines);
  const rest = pending.length - shown.length;

  return (
    <div
      ref={ref}
      className={`paper paper-${size}`}
      style={{
        ...paperStyle(size),
        height: `${PAPER_MM[size].h}mm`,
        padding: `${size === 'a4' ? 14 : size === 'b5' ? 12 : 10}mm`,
        fontSize: `${base}pt`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ border: '2px solid #000', padding: '1em', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #000', paddingBottom: '0.4em', marginBottom: '0.7em' }}>
          <strong style={{ fontSize: '1.4em', letterSpacing: '0.1em' }}>お預かり資料</strong>
          <span>{officeName}</span>
        </div>
        <div style={{ display: 'flex', gap: '1em', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.9em' }}>預かり番号</div>
            <div style={{ fontSize: '2.4em', fontWeight: 800, lineHeight: 1.1 }}>{d.no}</div>
            <div style={{ fontSize: '2em', fontWeight: 800, lineHeight: 1.25, marginTop: '0.35em', wordBreak: 'break-all' }}>{d.client_name} 様</div>
          </div>
          {qr && <img src={qr} alt="" style={{ width: '6em', height: '6em', flex: 'none' }} />}
        </div>
        {/* 担当者と返却予定は、棚で見てすぐ分かるよう番号・顧客名と同じ大きさにする */}
        <div style={{ display: 'flex', gap: '0.6em', marginTop: '0.7em' }}>
          {[
            ['担当者', d.staff_name],
            ['返却予定', fmtDate(d.expected_return) || '未定'],
          ].map(([k, v]) => (
            <div key={k} style={{ flex: 1, minWidth: 0, border: '2px solid #000', borderRadius: '0.3em', padding: '0.3em 0.6em' }}>
              <div style={{ fontSize: '0.9em', fontWeight: 600 }}>{k}</div>
              <div style={{ fontSize: '2em', fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
            </div>
          ))}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.8em' }}>
          <tbody>
            {[
              ['預かり日', fmtDateTime(d.received_at)],
              ['用途', d.purpose],
              ['持参者', d.handed_by],
              ['保管場所', d.location],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <tr key={k}>
                  <th style={{ textAlign: 'left', fontWeight: 600, padding: '0.25em 0', width: '5.5em', borderBottom: '1px solid #999' }}>{k}</th>
                  <td style={{ padding: '0.25em 0', borderBottom: '1px solid #999' }}>{v}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <div style={{ marginTop: '0.8em', fontWeight: 700 }}>資料（{pending.length}点）</div>
        <ul style={{ margin: '0.3em 0 0', paddingLeft: '1.3em', lineHeight: 1.45 }}>
          {shown.map((it) => (
            <li key={it.i}>
              {it.name}
              {it.qty && `　${it.qty}`}
            </li>
          ))}
          {rest > 0 && <li>ほか {rest} 点</li>}
        </ul>
        <div style={{ marginTop: 'auto', fontSize: '0.75em', borderTop: '1px solid #000', paddingTop: '0.4em' }}>返却時はアプリで受領サインをもらってください</div>
      </div>
    </div>
  );
}

export function ReceiptPaper({ d, officeName, ref }: { d: Deposit; officeName: string; ref?: Ref<HTMLDivElement> }) {
  const done = returnedIdx(d);
  return (
    <div ref={ref} className="paper paper-b5" style={{ ...paperStyle('b5'), padding: '12mm 13mm', fontSize: '10pt' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5pt' }}>
        <span>No.{d.no}</span>
        <span>出力日時：{fmtDateTime(new Date().toISOString())}</span>
      </div>
      <h1 style={{ textAlign: 'center', fontSize: '18pt', letterSpacing: '0.3em', margin: '4mm 0 6mm' }}>資料預り証</h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4mm' }}>
        <div style={{ fontSize: '14pt', borderBottom: '1px solid #000', paddingBottom: 2, minWidth: '80mm' }}>{d.client_name}　様</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: '11pt' }}>{officeName}</div>
          <div>担当：{d.staff_name}</div>
        </div>
      </div>
      <p>下記の資料を確かにお預かりいたしました。</p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4mm' }}>
        <thead>
          <tr>
            <th style={{ ...head, width: '6mm' }}>#</th>
            <th style={head}>資料名</th>
            <th style={{ ...head, width: '18mm' }}>数量</th>
            <th style={{ ...head, width: '28mm' }}>返却</th>
          </tr>
        </thead>
        <tbody>
          {d.items.map((it, i) => {
            const r = d.deposit_returns.find((x) => x.item_idx.includes(i));
            return (
              <tr key={i}>
                <td style={cell}>{i + 1}</td>
                <td style={cell}>{it.name}</td>
                <td style={cell}>{it.qty}</td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>{done.has(i) && r ? `済 ${fmtDate(r.returned_at)}` : '未'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4mm' }}>
        <tbody>
          <tr>
            <th style={{ ...head, width: '26mm' }}>預かり日時</th>
            <td style={cell}>{fmtDateTime(d.received_at)}</td>
            <th style={{ ...head, width: '18mm' }}>用途</th>
            <td style={cell}>{d.purpose}</td>
          </tr>
          <tr>
            <th style={head}>持参者</th>
            <td style={cell}>{d.handed_by}</td>
            <th style={head}>返却予定</th>
            <td style={cell}>{fmtDate(d.expected_return)}</td>
          </tr>
          <tr>
            <th style={head}>お客様サイン</th>
            <td style={cell} colSpan={3}>
              <img src={d.signature} alt="" style={{ height: '20mm', maxWidth: '100%', objectFit: 'contain' }} />
            </td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: '12pt', borderBottom: '2px solid #000', paddingBottom: 3 }}>返却状況</h2>
      {!d.deposit_returns.length ? (
        <p>（未返却）</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...head, width: '28mm' }}>返却日時</th>
              <th style={head}>返却資料</th>
              <th style={{ ...head, width: '28mm' }}>受領者 / 担当</th>
              <th style={{ ...head, width: '36mm' }}>受領サイン</th>
            </tr>
          </thead>
          <tbody>
            {d.deposit_returns.map((r) => (
              <tr key={r.id}>
                <td style={cell}>{fmtDateTime(r.returned_at)}</td>
                <td style={cell}>
                  {r.item_idx.map((i) => d.items[i]?.name).join('、')}
                  {r.memo && <div style={{ fontSize: '8.5pt' }}>{r.memo}</div>}
                </td>
                <td style={cell}>
                  {r.recipient}
                  <div style={{ fontSize: '8.5pt' }}>担当：{r.staff_name}</div>
                </td>
                <td style={cell}>
                  <img src={r.signature} alt="" style={{ height: '15mm', maxWidth: '100%', objectFit: 'contain' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: '6mm', fontSize: '7.5pt', color: '#444', wordBreak: 'break-all' }}>
        照合コード（預かり）：{d.hash}
        {d.deposit_returns.map((r, i) => (
          <div key={r.id}>
            照合コード（返却{i + 1}）：{r.hash}
          </div>
        ))}
      </div>
    </div>
  );
}

// 1回分の返却について、お客様の受領サイン入りの「資料返却確認書」
export function ReturnPaper({ d, r, officeName, ref }: { d: Deposit; r: ReturnEvent; officeName: string; ref?: Ref<HTMLDivElement> }) {
  const done = returnedIdx(d);
  const remaining = d.items.filter((_, i) => !done.has(i));
  return (
    <div ref={ref} className="paper paper-b5" style={{ ...paperStyle('b5'), padding: '12mm 13mm', fontSize: '10pt' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5pt' }}>
        <span>No.{d.no}</span>
        <span>出力日時：{fmtDateTime(new Date().toISOString())}</span>
      </div>
      <h1 style={{ textAlign: 'center', fontSize: '18pt', letterSpacing: '0.2em', margin: '4mm 0 6mm' }}>資料返却確認書</h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4mm' }}>
        <div style={{ fontSize: '14pt', borderBottom: '1px solid #000', paddingBottom: 2, minWidth: '80mm' }}>{d.client_name}　様</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: '11pt' }}>{officeName}</div>
          <div>返却担当：{r.staff_name}</div>
        </div>
      </div>
      <p>お預かりしていた下記の資料を返却し、お客様に受領いただいたことを確認しました。</p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4mm' }}>
        <thead>
          <tr>
            <th style={{ ...head, width: '6mm' }}>#</th>
            <th style={head}>返却した資料</th>
            <th style={{ ...head, width: '22mm' }}>数量</th>
          </tr>
        </thead>
        <tbody>
          {r.item_idx.map((i, n) => (
            <tr key={i}>
              <td style={cell}>{n + 1}</td>
              <td style={cell}>{d.items[i]?.name}</td>
              <td style={cell}>{d.items[i]?.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4mm' }}>
        <tbody>
          <tr>
            <th style={{ ...head, width: '26mm' }}>返却日時</th>
            <td style={cell}>{fmtDateTime(r.returned_at)}</td>
            <th style={{ ...head, width: '22mm' }}>預かり日</th>
            <td style={cell}>{fmtDateTime(d.received_at)}</td>
          </tr>
          <tr>
            <th style={head}>受領者</th>
            <td style={cell}>{r.recipient}</td>
            <th style={head}>預かり担当</th>
            <td style={cell}>{d.staff_name}</td>
          </tr>
          {r.memo && (
            <tr>
              <th style={head}>メモ</th>
              <td style={cell} colSpan={3}>
                {r.memo}
              </td>
            </tr>
          )}
          <tr>
            <th style={head}>受領サイン</th>
            <td style={cell} colSpan={3}>
              <img src={r.signature} alt="" style={{ height: '22mm', maxWidth: '100%', objectFit: 'contain' }} />
            </td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: '12pt', borderBottom: '2px solid #000', paddingBottom: 3 }}>引き続きお預かりしている資料</h2>
      {remaining.length ? (
        <ul>
          {remaining.map((it, i) => (
            <li key={i}>
              {it.name}
              {it.qty && `　${it.qty}`}
            </li>
          ))}
        </ul>
      ) : (
        <p>なし（すべて返却済み）</p>
      )}

      <div style={{ marginTop: '6mm', fontSize: '7.5pt', color: '#444', wordBreak: 'break-all' }}>照合コード（返却）：{r.hash}</div>
    </div>
  );
}
