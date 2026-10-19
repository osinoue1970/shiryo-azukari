import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, getSettings, DEFAULT_SETTINGS, type Settings, type Staff } from './db';

// 表示モード: mine = 自分の担当分だけ（個人モード） / all = 全員の分（管理者モード）
export type Scope = 'mine' | 'all';

interface AuthState {
  session: Session | null;
  staff: Staff | null;
  settings: Settings;
  scope: Scope;
  setScope: (s: Scope) => void;
  reloadSettings: () => Promise<void>;
  reloadStaff: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider missing');
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [staffChecked, setStaffChecked] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [scope, setScopeState] = useState<Scope>('mine');

  // 管理者だけがモードを切り替えられる。選んだモードは端末ごとに覚える
  const scopeKey = staff ? `scope:${staff.user_id}` : '';
  useEffect(() => {
    if (!staff?.is_admin) return setScopeState('mine');
    try {
      setScopeState(localStorage.getItem(scopeKey) === 'mine' ? 'mine' : 'all');
    } catch {
      setScopeState('all');
    }
  }, [scopeKey, staff?.is_admin]);
  const setScope = (s: Scope) => {
    if (!staff?.is_admin) return;
    setScopeState(s);
    try {
      localStorage.setItem(scopeKey, s);
    } catch {
      /* 保存できなくても動作に影響なし */
    }
  };

  // auth.getUser() はログイン直後の認証ロック中に呼ぶと止まるため、セッションの user id を使う
  const userId = session?.user.id;
  const reloadStaff = async () => {
    if (!userId) return setStaff(null);
    const res = await supabase.from('staff').select('*').eq('user_id', userId).maybeSingle();
    setStaff((res.data as Staff) ?? null);
    setStaffChecked(true);
  };
  const reloadSettings = async () => setSettings(await getSettings());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setStaffChecked(false);
    if (!userId) {
      setStaff(null);
      return;
    }
    // onAuthStateChange の処理が終わってから問い合わせる
    const t = setTimeout(() => {
      reloadStaff();
      reloadSettings();
    }, 0);
    return () => clearTimeout(t);
  }, [userId]);

  if (loading) return <main className="muted">読み込み中…</main>;
  if (!session) return <Login />;
  if (!staff && !staffChecked) return <main className="muted">読み込み中…</main>;
  if (!staff) return <NoStaff />;
  if (!staff.active) return <Pending email={staff.email} />;

  return <Ctx.Provider value={{ session, staff, settings, scope, setScope, reloadSettings, reloadStaff }}>{children}</Ctx.Provider>;
}

function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('last-email') ?? '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        try {
          localStorage.setItem('last-email', email);
        } catch {
          /* 保存できなくても動作に影響なし */
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        if (!data.session) setInfo('登録を受け付けました。ログインして、管理者の許可をお待ちください。');
      }
    } catch (err) {
      setError(err instanceof Error ? translate(err.message) : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="narrow" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 40px)' }}>
      <h1 style={{ textAlign: 'center' }}>資料 預かり・返却管理</h1>
      <form className="card" onSubmit={submit}>
        <h2>{mode === 'in' ? 'ログイン' : '職員登録'}</h2>
        {error && <div className="error">{error}</div>}
        {info && <div className="notice">{info}</div>}
        {mode === 'up' && (
          <label className="field">
            <span>氏名</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>メールアドレス</span>
          <input type="email" name="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label className="field">
          <span>パスワード{mode === 'up' && '（8文字以上）'}</span>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'up' ? 8 : undefined}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          />
        </label>
        <button className="primary block" disabled={busy}>
          {mode === 'in' ? 'ログイン' : '登録する'}
        </button>
        {mode === 'in' && (
          <p className="small-text muted" style={{ margin: '10px 0 0' }}>
            一度ログインすると、ログアウトするまでこの端末ではログインしたままになります。パスワードの保存を聞かれたら「保存」を選ぶと、次からはFace ID・指紋で入力できます。
          </p>
        )}
        <p className="small-text muted" style={{ textAlign: 'center', marginBottom: 0 }}>
          {mode === 'in' ? (
            <a href="#" onClick={(e) => (e.preventDefault(), setMode('up'))}>はじめての方は職員登録</a>
          ) : (
            <a href="#" onClick={(e) => (e.preventDefault(), setMode('in'))}>ログインに戻る</a>
          )}
        </p>
      </form>
      {mode === 'up' && (
        <p className="small-text muted">
          登録後、管理者が「設定」画面で利用を許可すると使えるようになります。登録したことを管理者に伝えてください。
        </p>
      )}
    </main>
  );
}

function Pending({ email }: { email: string }) {
  return (
    <main className="narrow" style={{ paddingTop: 60 }}>
      <div className="card">
        <h2>管理者の承認待ちです</h2>
        <p>{email} で登録されています。管理者が「設定 → 職員」で利用を許可すると使えるようになります。登録したことを管理者に伝えてください。</p>
        <div className="actions">
          <button onClick={() => location.reload()}>再読み込み</button>
          <button onClick={() => supabase.auth.signOut()}>ログアウト</button>
        </div>
      </div>
    </main>
  );
}

// 職員データが無い（アカウントが削除された等）ログイン状態から抜け出せるようにする
function NoStaff() {
  return (
    <main className="narrow" style={{ paddingTop: 60 }}>
      <div className="card">
        <h2>職員情報が見つかりません</h2>
        <p>このアカウントは利用できない状態です。いったんログアウトして、ログインし直すか職員登録をしてください。</p>
        <button className="primary" onClick={() => supabase.auth.signOut().finally(() => location.reload())}>
          ログアウト
        </button>
      </div>
    </main>
  );
}

function translate(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'メールアドレスまたはパスワードが違います。';
  if (msg.includes('Email not confirmed')) return 'まだ利用できる状態になっていません。管理者に連絡してください。';
  if (msg.toLowerCase().includes('rate limit')) return '登録が混み合っています。しばらく時間をおいてもう一度お試しください。';
  if (msg.includes('already registered')) return 'このメールアドレスは登録済みです。ログインしてください。';
  if (msg.includes('Password should be')) return 'パスワードは8文字以上にしてください。';
  return msg;
}
