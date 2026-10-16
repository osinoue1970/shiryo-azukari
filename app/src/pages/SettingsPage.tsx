import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { listStaff, saveSettings, supabase, updateStaff, type Settings, type Staff } from '../db';

export default function SettingsPage() {
  const { staff: me, settings, reloadSettings, reloadStaff } = useAuth();
  const [form, setForm] = useState<Settings>(settings);
  const [myName, setMyName] = useState(me?.name ?? '');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const isAdmin = !!me?.is_admin;

  const loadStaff = () => listStaff().then(setStaffList).catch((e) => setError(e.message));
  useEffect(() => {
    loadStaff();
  }, []);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setError('');
    setMsg('');
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="narrow">
      <h1>設定</h1>
      {msg && <div className="notice">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>自分の情報</h2>
        <p className="small-text muted" style={{ marginTop: -6 }}>
          {me?.email}
          {isAdmin && '（管理者）'}
        </p>
        <label className="field">
          <span>氏名（担当者名として表示）</span>
          <input value={myName} onChange={(e) => setMyName(e.target.value)} />
        </label>
        <div className="actions">
          <button className="primary" onClick={() => run(async () => (await updateStaff(me!.user_id, { name: myName.trim() }), await reloadStaff(), await loadStaff()), '氏名を保存しました。')}>
            保存
          </button>
          <button onClick={() => supabase.auth.signOut()}>ログアウト</button>
        </div>
      </div>

      <div className="card">
        <h2>事務所の設定</h2>
        {!isAdmin && <p className="small-text muted">変更できるのは管理者のみです。</p>}
        <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0 }}>
          <label className="field">
            <span>事務所名（ラベル・預り証に印字）</span>
            <input value={form.office_name} onChange={(e) => setForm({ ...form, office_name: e.target.value })} />
          </label>
          <label className="field">
            <span>「長期」とみなす日数</span>
            <input type="number" inputMode="numeric" min={1} value={form.long_term_days} onChange={(e) => setForm({ ...form, long_term_days: Number(e.target.value) || 30 })} />
          </label>
          <label className="field">
            <span>PDFの送信先メールアドレス（標準）</span>
            <input type="email" value={form.pdf_email} onChange={(e) => setForm({ ...form, pdf_email: e.target.value })} placeholder="例：print@example.co.jp" />
          </label>
          <button className="primary" onClick={() => run(async () => (await saveSettings(form), await reloadSettings()), '事務所の設定を保存しました。')}>
            保存
          </button>
        </fieldset>
      </div>

      <div className="card">
        <h2>職員</h2>
        <p className="small-text muted" style={{ marginTop: -6 }}>
          新しい職員は、ログイン画面の「職員登録」から登録したあと、管理者が「利用を許可」すると使えるようになります。本人であることを確認してから許可してください。
          {isAdmin && ' 管理者は、ほかの職員を管理者にできます。'}
        </p>
        {staffList.map((s) => {
          const self = s.user_id === me?.user_id;
          const save = (patch: Partial<Staff>, ok: string) => run(async () => (await updateStaff(s.user_id, patch), await loadStaff()), ok);
          return (
            <div key={s.user_id} className="check-item" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <strong>{s.name || '（氏名未設定）'}</strong>
                {self && <span className="small-text muted">（自分）</span>}
                <div className="small-text muted">{s.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {s.is_admin && <span className="badge kept">管理者</span>}
                {!s.active && <span className="badge long">許可待ち・停止中</span>}
                {s.active && !s.is_admin && <span className="badge returned">職員</span>}
                {isAdmin && !self && (
                  <>
                    {s.active &&
                      (s.is_admin ? (
                        <button className="small" onClick={() => confirm(`${s.name || s.email} さんの管理者権限を外しますか？`) && save({ is_admin: false }, '管理者権限を外しました。')}>
                          管理者を外す
                        </button>
                      ) : (
                        <button className="small primary" onClick={() => save({ is_admin: true }, `${s.name || s.email} さんを管理者にしました。`)}>
                          管理者にする
                        </button>
                      ))}
                    {s.active ? (
                      <button className="small" onClick={() => confirm(`${s.name || s.email} さんの利用を止めますか？`) && save({ active: false, is_admin: false }, '利用を止めました。')}>
                        利用を止める
                      </button>
                    ) : (
                      <button className="small ok" onClick={() => save({ active: true }, '利用を許可しました。')}>
                        利用を許可
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
