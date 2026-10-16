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
import { listDeposits, listStaff, statusOf } from './db';

function Layout() {
  const { settings, staff } = useAuth();
  const loc = useLocation();
  const isPrint = /\/(label|receipt)$|\/returns\//.test(loc.pathname);
  const [queueCount, setQueueCount] = useState(0);
  const [pendingStaff, setPendingStaff] = useState(0);
  const refreshQueue = () =>
    listDeposits()
      .then((rows) =>
        setQueueCount(
          rows.reduce(
            (n, d) => n + (!d.label_printed_at && statusOf(d) !== 'returned' ? 1 : 0) + d.deposit_returns.filter((r) => !r.printed_at).length,
            0,
          ),
        ),
      )
      .catch(() => {});
  useEffect(() => {
    refreshQueue();
    if (staff?.is_admin) listStaff().then((s) => setPendingStaff(s.filter((x) => !x.active).length)).catch(() => {});
  }, [loc.pathname]);
  return (
    <>
      <header className="topbar no-print">
        <Link to="/" className="brand">
          {settings.office_name}<span className="sub">　資料預かり管理</span>
        </Link>
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
