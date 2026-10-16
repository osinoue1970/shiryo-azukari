import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// 承認済み職員だけが、アプリで作った PDF を指定アドレスへメール送信できる。
export async function POST(req: Request): Promise<Response> {
  const json = (status: number, body: object) => Response.json(body, { status });

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'ログインが必要です。' });

  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return json(401, { error: 'ログインし直してください。' });
  const { data: isStaff } = await supabase.rpc('is_staff');
  if (!isStaff) return json(403, { error: '利用が許可されていません。' });

  let body: { to?: string; subject?: string; text?: string; filename?: string; pdfBase64?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: '送信内容が正しくありません。' });
  }
  const to = (body.to ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json(400, { error: '送信先メールアドレスが正しくありません。' });
  if (!body.pdfBase64 || !body.filename?.endsWith('.pdf')) return json(400, { error: 'PDFがありません。' });

  if (!process.env.RESEND_API_KEY) return json(500, { error: 'メール送信の設定（RESEND_API_KEY）がありません。' });
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.MAIL_FROM || '資料預かり管理 <onboarding@resend.dev>';

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: (body.subject ?? '資料預かり管理 PDF').slice(0, 200),
    text: `${body.text ?? ''}\n\n（送信者：${userData.user.email}）`,
    attachments: [{ filename: body.filename, content: body.pdfBase64 }],
  });
  if (error) {
    const owner = error.message.match(/own email address \(([^)]+)\)/)?.[1];
    if (owner)
      return json(502, { error: `送信元ドメインの認証が済むまでは ${owner} 宛てにしか送れません。送信先を ${owner} にしてください。` });
    return json(502, { error: `メール送信に失敗しました：${error.message}` });
  }
  return json(200, { ok: true });
}
