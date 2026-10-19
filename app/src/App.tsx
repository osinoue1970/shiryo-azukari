import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import ListPage from './pages/ListPage';
import NewDepositPage from './pages/NewDepositPage';
import DetailPage from './pages/DetailPage';
import ReturnPage from './pages/ReturnPage';
import { LabelPrintPage, ReceiptPrintPage, ReturnReceiptPage } from './pages/PrintPages';
import SettingsPage from './pages/SettingsPage';
import DonePage from './pages/DonePage';
import PrintQueuePage from './pages/PrintQueuePage';
import { listDeposits, listStaff, queueItems, supabase } from './db';

// ヘッダー右側のユーザー名チップ。タップするとモード切替（管理者のみ）・設定・ログアウトのメニューが開く
function UserMenu() {
  const { staff, scope, setScope } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);
  const name = staff?.name || '氏名未設定';
  const isAdmin = !!staff?.is_admin;
  const modeLabel = scope === 'all' ? '管理者モード' : '個人モード';
  return (
    <div className="user-menu">
      <button type="button" className="user-chip" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title={isAdmin ? `${name}（${modeLabel}）` : name}>
        {name}
        {isAdmin && <span className="chip-mode">・{modeLabel}</span>}
        <span aria-hidden> ▾</span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            <div className="menu-head">
              {name}
              <div className="small-text muted">
                {staff?.email}
                {isAdmin && '（管理者）'}
              </div>
            </div>
            {isAdmin && (
              <>
                <button type="button" role="menuitemradio" aria-checked={scope === 'mine'} className={scope === 'mine' ? 'on' : ''} onClick={() => (setScope('mine'), setOpen(false))}>
                  <span className="menu-label">個人モード</span>
                  <small>自分の担当分だけを表示</small>
                </button>
                <button type="button" role="menuitemradio" aria-checked={scope === 'all'} className={scope === 'all' ? 'on' : ''} onClick={() => (setScope('all'), setOpen(false))}>
                  <span className="menu-label">管理者モード</span>
                  <small>全員の分を表示</small>
                </button>
                <div className="menu-sep" />
              </>
            )}
            {!staff?.name && (
              <Link to="/settings" role="menuitem">
                氏名を登録する
                <small className="muted">氏名を入れると「自分の分」だけ表示できます</small>
              </Link>
            )}
            <Link to="/settings" role="menuitem">
              設定
            </Link>
            <button type="button" role="menuitem" onClick={() => supabase.auth.signOut()}>
              ログアウト
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Layout() {
  const { settings, staff, scope } = useAuth();
  const loc = useLocation();
  const isPrint = /\/(label|receipt)$|\/returns\//.test(loc.pathname);
  const [queueCount, setQueueCount] = useState(0);
  const [pendingStaff, setPendingStaff] = useState(0);
  // 個人モードでは自分の分だけ数える（印刷待ち画面の初期表示と合わせる）
  const onlyStaff = scope === 'mine' ? staff?.name ?? '' : '';
  const refreshQueue = () =>
    listDeposits()
      .then((rows) => setQueueCount(queueItems(rows, onlyStaff).length))
      .catch(() => {});
  useEffect(() => {
    refreshQueue();
    if (staff?.is_admin) listStaff().then((s) => setPendingStaff(s.filter((x) => !x.active).length)).catch(() => {});
  }, [loc.pathname, onlyStaff]);
  return (
    <>
      <header className="topbar no-print">
        <Link to="/" className="brand">
          {settings.office_name}<span className="sub">　資料預かり管理</span>
        </Link>
        <UserMenu />
        <nav>
          <NavLink to="/" end>ホーム</NavLink>
          <NavLink to="/new" className="cta">＋預かる</NavLink>
          <NavLink to="/print" className="pc-only">
            印刷待ち{queueCount > 0 && <span className="nav-count">{queueCount}</span>}
          </NavLink>
          <NavLink to="/settings">
            設定{pendingStaff > 0 && <span className="nav-count">{pendingStaff}</span>}
          </NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ListPage />} />
          <Route path="/new" element={<NewDepositPage />} />
          <Route path="/d/:id" element={<DetailPage />} />
          <Route path="/d/:id/return" element={<ReturnPage />} />
          <Route path="/d/:id/done" element={<DonePage kind="deposit" />} />
          <Route path="/d/:id/returned/:rid" element={<DonePage kind="return" />} />
          <Route path="/d/:id/label" element={<LabelPrintPage />} />
          <Route path="/d/:id/receipt" element={<ReceiptPrintPage />} />
          <Route path="/d/:id/returns/:rid" element={<ReturnReceiptPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/print" element={<PrintQueuePage onChanged={refreshQueue} />} />
        </Routes>
      </main>
      {!isPrint && loc.pathname !== '/new' && loc.pathname !== '/print' && !/\/(done|returned)/.test(loc.pathname) && !loc.pathname.endsWith('/return') && (
        <Link to="/new" className="fab no-print">
          ＋ 資料を預かる
        </Link>
      )}
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Layout />
      </AuthProvider>
    </HashRouter>
  );
}
