// 全角の英数字・記号を半角にする（数量欄などで使う）
export function toHalfWidth(s: string): string {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');
}

// 数量の入力欄。数字キーボードを出し、全角で入っても半角に直す。
export function QtyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="qty"
      value={value}
      inputMode="numeric"
      onChange={(e) => onChange(toHalfWidth(e.target.value))}
      onFocus={(e) => e.target.select()}
      placeholder="数量"
      aria-label="数量"
    />
  );
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

// 日付は「選ぶ」ものだと分かる見た目にする。よく使う期間はワンタップで選べる。
export function DatePickField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const shown = value
    ? (() => {
        const d = new Date(`${value}T00:00:00`);
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY[d.getDay()]}）`;
      })()
    : '';
  const quick: [string, string][] = [
    ['1週間後', addDays(7)],
    ['2週間後', addDays(14)],
    ['1か月後', addMonths(1)],
    ['3か月後', addMonths(3)],
  ];
  return (
    <div>
      <label className={`date-pick ${value ? 'has-value' : ''}`}>
        <span className="date-pick-icon" aria-hidden>
          📅
        </span>
        <span className="date-pick-text">{shown || 'タップしてカレンダーから選ぶ'}</span>
        <span className="date-pick-caret" aria-hidden>
          ▾
        </span>
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} aria-label="日付を選ぶ" />
      </label>
      <div className="chips" style={{ marginTop: 8, marginBottom: 0 }}>
        {quick.map(([label, v]) => (
          <button type="button" key={label} className={`chip ${value === v ? 'on' : ''}`} onClick={() => onChange(v)}>
            {label}
          </button>
        ))}
        {value && (
          <button type="button" className="chip" onClick={() => onChange('')}>
            クリア
          </button>
        )}
      </div>
    </div>
  );
}
