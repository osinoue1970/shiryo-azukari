import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

export interface DocItem {
  name: string;
  qty: string;
}

export interface ReturnEvent {
  id: string;
  deposit_id: string;
  returned_at: string;
  staff_name: string; // 返却した事務所側担当者
  recipient: string; // 受け取ったクライアント側の氏名
  item_idx: number[]; // 返却した資料の index
  memo: string;
  signature: string; // dataURL (PNG)
  hash: string;
  printed_at: string | null; // 返却確認書を印刷した日時
  printed_by: string;
}

export interface Deposit {
  id: string;
  no: string; // 預かり番号 例: 2026-0001（DBで採番）
  client_name: string;
  handed_by: string; // 資料を持参した人の氏名
  items: DocItem[];
  purpose: string;
  received_at: string;
  staff_name: string; // 受け取った担当者
  location: string; // 保管場所
  expected_return: string | null;
  memo: string;
  signature: string; // 預かり時の顧客サイン
  hash: string;
  label_printed_at: string | null; // 貼付ラベルを印刷した日時
  label_printed_by: string;
  created_at: string;
  updated_at: string;
  deposit_returns: ReturnEvent[];
}

export interface Settings {
  office_name: string;
  long_term_days: number;
  label_size: 'a4' | 'a5';
  pdf_email: string; // PDFの標準送信先
}

export interface Staff {
  user_id: string;
  email: string;
  name: string;
  active: boolean;
  is_admin: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  office_name: '', // 実際の事務所名はデータベースの設定から読み込む
  long_term_days: 30,
  label_size: 'a5',
  pdf_email: '',
};

const LIST_COLUMNS =
  'id,no,client_name,handed_by,items,purpose,received_at,staff_name,location,expected_return,memo,hash,label_printed_at,label_printed_by,created_at,updated_at,deposit_returns(id,deposit_id,returned_at,staff_name,recipient,item_idx,memo,hash,printed_at,printed_by)';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// 一覧ではサイン画像を除いて軽量に取得する
export async function listDeposits(): Promise<Deposit[]> {
  const rows = check(await supabase.from('deposits').select(LIST_COLUMNS).order('received_at', { ascending: false }));
  return (rows as unknown as Deposit[]).map((d) => ({ ...d, signature: '' }));
}

export async function getDeposit(id: string): Promise<Deposit> {
  const d = check(
    await supabase.from('deposits').select('*, deposit_returns(*)').eq('id', id).single(),
  ) as unknown as Deposit;
  d.deposit_returns.sort((a, b) => a.returned_at.localeCompare(b.returned_at));
  return d;
}

export type NewDeposit = Omit<Deposit, 'id' | 'no' | 'hash' | 'label_printed_at' | 'label_printed_by' | 'created_at' | 'updated_at' | 'deposit_returns'>;

export async function createDeposit(input: NewDeposit): Promise<string> {
  const hash = await sha256(receiveHashSource(input));
  const row = check(await supabase.from('deposits').insert({ ...input, hash }).select('id').single());
  return (row as unknown as { id: string }).id;
}

export async function updateDepositNotes(id: string, patch: Pick<Deposit, 'location' | 'expected_return' | 'memo'>) {
  check(await supabase.from('deposits').update(patch).eq('id', id));
}

export type NewReturn = Omit<ReturnEvent, 'id' | 'hash' | 'printed_at' | 'printed_by'>;

export async function createReturn(d: Deposit, input: NewReturn): Promise<string> {
  const hash = await sha256(returnHashSource(d, input));
  const row = check(await supabase.from('deposit_returns').insert({ ...input, hash }).select('id').single());
  return (row as unknown as { id: string }).id;
}

// 印刷待ち一覧で「印刷済み」にする
export async function markPrinted(depositIds: string[], returnIds: string[], by: string) {
  const at = new Date().toISOString();
  if (depositIds.length) check(await supabase.from('deposits').update({ label_printed_at: at, label_printed_by: by }).in('id', depositIds));
  if (returnIds.length) check(await supabase.from('deposit_returns').update({ printed_at: at, printed_by: by }).in('id', returnIds));
}

export async function getSettings(): Promise<Settings> {
  const res = await supabase.from('app_settings').select('office_name,long_term_days,label_size,pdf_email').eq('id', 1).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(res.data ?? {}) } as Settings;
}

export async function saveSettings(s: Settings) {
  check(await supabase.from('app_settings').update({ ...s, updated_at: new Date().toISOString() }).eq('id', 1));
}

export async function listStaff(): Promise<Staff[]> {
  return check(await supabase.from('staff').select('*').order('created_at')) as Staff[];
}

export async function updateStaff(userId: string, patch: Partial<Pick<Staff, 'name' | 'active' | 'is_admin'>>) {
  check(await supabase.from('staff').update(patch).eq('user_id', userId));
}

export async function clientNames(): Promise<string[]> {
  const rows = check(await supabase.from('deposits').select('client_name').order('received_at', { ascending: false }).limit(1000)) as { client_name: string }[];
  return [...new Set(rows.map((r) => r.client_name))];
}

export type Status = 'kept' | 'partial' | 'returned';

export function returnedIdx(d: Deposit): Set<number> {
  return new Set(d.deposit_returns.flatMap((r) => r.item_idx));
}

export function statusOf(d: Deposit): Status {
  const n = returnedIdx(d).size;
  if (n === 0) return 'kept';
  return n >= d.items.length ? 'returned' : 'partial';
}

export const STATUS_LABEL: Record<Status, string> = {
  kept: '預かり中',
  partial: '一部返却',
  returned: '返却済',
};

// 「自分の分」: 預かりの担当者が自分、または自分が返却した記録がある
export function isMine(d: Deposit, name: string): boolean {
  if (!name) return true;
  return d.staff_name === name || d.deposit_returns.some((r) => r.staff_name === name);
}

export interface QueueItem {
  key: string;
  kind: 'label' | 'return';
  deposit: Deposit;
  ret?: ReturnEvent;
  at: string;
  staff_name: string; // ラベルは預かり担当者、返却確認書は返却担当者
}

// まだ印刷していない貼付ラベル・返却確認書。onlyStaff を渡すとその担当者の分だけ
export function queueItems(rows: Deposit[], onlyStaff = ''): QueueItem[] {
  const q: QueueItem[] = [];
  for (const d of rows) {
    if (!d.label_printed_at && statusOf(d) !== 'returned' && (!onlyStaff || d.staff_name === onlyStaff)) {
      q.push({ key: `l:${d.id}`, kind: 'label', deposit: d, at: d.received_at, staff_name: d.staff_name });
    }
    for (const r of d.deposit_returns) {
      if (!r.printed_at && (!onlyStaff || r.staff_name === onlyStaff)) {
        q.push({ key: `r:${r.id}`, kind: 'return', deposit: d, ret: r, at: r.returned_at, staff_name: r.staff_name });
      }
    }
  }
  q.sort((a, b) => a.at.localeCompare(b.at));
  return q;
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// 署名時点の内容から SHA-256 を計算し、印刷物とデータの照合に使う（crypto.subtle は https / localhost のみ）
export async function sha256(value: unknown): Promise<string> {
  if (!crypto.subtle) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function receiveHashSource(d: NewDeposit) {
  return {
    client_name: d.client_name,
    handed_by: d.handed_by,
    items: d.items,
    purpose: d.purpose,
    received_at: d.received_at,
    staff_name: d.staff_name,
    signature: d.signature,
  };
}

export function returnHashSource(d: Pick<Deposit, 'id' | 'items'>, r: NewReturn) {
  return {
    deposit_id: d.id,
    returned_at: r.returned_at,
    staff_name: r.staff_name,
    recipient: r.recipient,
    items: r.item_idx.map((i) => d.items[i]),
    signature: r.signature,
  };
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
