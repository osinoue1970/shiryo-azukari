import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import PdfActions from '../PdfActions';
import { LabelPaper, ReceiptPaper, ReturnPaper } from '../papers';
import { getDeposit, markPrinted, fmtDate, fmtDateTime, type Deposit } from '../db';


function useDeposit() {
  const { id } = useParams();
  const [d, setD] = useState<Deposit | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getDeposit(id!).then(setD).catch((e) => setError(e.message));
  }, [id]);
  return { d, error };
}

function BackLink({ id }: { id: string }) {
  return (
    <div className="print-toolbar no-print">
      <Link to={`/d/${id}`} className="btn small">
        ← 戻る
      </Link>
    </div>
  );
}

export function LabelPrintPage() {
  const { settings, staff } = useAuth();
  const { d, error } = useDeposit();
  const paperRef = useRef<HTMLDivElement>(null);

  if (error) return <div className="error">{error}</div>;
  if (!d) return <p className="muted">読み込み中…</p>;

  return (
    <>
      <BackLink id={d.id} />
      <PdfActions
        paperRef={paperRef}
        size="b5"
        filename={`貼付ラベル_${d.no}_${d.client_name}.pdf`}
        subject={`【貼付ラベル】${d.client_name} No.${d.no}`}
        text={`${d.client_name} 様からお預かりした資料の貼付ラベルです。\n印刷して資料に貼り付けてください。\n\n預かり番号：${d.no}\n預かり日：${fmtDate(d.received_at)}\n担当：${d.staff_name}`}
        onPrinted={() => markPrinted([d.id], [], staff?.name ?? '')}
      />
      <div className="paper-scroll">
        <LabelPaper ref={paperRef} d={d} size="b5" officeName={settings.office_name} />
      </div>
    </>
  );
}

export function ReceiptPrintPage() {
  const { settings } = useAuth();
  const { d, error } = useDeposit();
  const paperRef = useRef<HTMLDivElement>(null);
  if (error) return <div className="error">{error}</div>;
  if (!d) return <p className="muted">読み込み中…</p>;

  return (
    <>
      <BackLink id={d.id} />
      <PdfActions
        paperRef={paperRef}
        size="b5"
        filename={`預り証_${d.no}_${d.client_name}.pdf`}
        subject={`【資料預り証】${d.client_name} No.${d.no}`}
        text={`${d.client_name} 様の資料預り証です。\n\n預かり番号：${d.no}\n預かり日時：${fmtDateTime(d.received_at)}\n担当：${d.staff_name}`}
      />
      <div className="paper-scroll">
        <ReceiptPaper ref={paperRef} d={d} officeName={settings.office_name} />
      </div>
    </>
  );
}

export function ReturnReceiptPage() {
  const { settings, staff } = useAuth();
  const { d, error } = useDeposit();
  const { rid } = useParams();
  const paperRef = useRef<HTMLDivElement>(null);
  if (error) return <div className="error">{error}</div>;
  if (!d) return <p className="muted">読み込み中…</p>;
  const r = d.deposit_returns.find((x) => x.id === rid);
  if (!r) return <div className="error">返却記録が見つかりません。</div>;

  return (
    <>
      <BackLink id={d.id} />
      <PdfActions
        paperRef={paperRef}
        size="b5"
        filename={`返却確認書_${d.no}_${d.client_name}_${fmtDate(r.returned_at).replace(/\//g, '')}.pdf`}
        subject={`【資料返却確認書】${d.client_name} No.${d.no}`}
        text={`${d.client_name} 様への資料返却確認書です。\n\n預かり番号：${d.no}\n返却日時：${fmtDateTime(r.returned_at)}\n受領者：${r.recipient}\n返却担当：${r.staff_name}`}
        onPrinted={() => markPrinted([], [r.id], staff?.name ?? '')}
      />
      <div className="paper-scroll">
        <ReturnPaper ref={paperRef} d={d} r={r} officeName={settings.office_name} />
      </div>
    </>
  );
}
