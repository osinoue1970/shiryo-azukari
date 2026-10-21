-- =====================================================================
-- 資料 預かり・返却管理アプリ  データベース初期設定
--
-- 使い方：Supabase の新しいプロジェクトで「SQL Editor」を開き、
--         このファイルの中身をすべて貼り付けて「Run」を1回押すだけです。
-- 何度も実行するものではありません（最初の1回だけ）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 職員
-- ---------------------------------------------------------------------
create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  active boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 最初に登録した人を管理者にし、2人目以降は管理者の許可待ちにする
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean;
begin
  select not exists(select 1 from public.staff) into first;
  insert into public.staff(user_id, email, name, active, is_admin)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), first, first);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.staff where user_id = auth.uid() and active)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.staff where user_id = auth.uid() and active and is_admin)
$$;

-- 利用許可・管理者の変更は管理者だけ
create or replace function public.protect_staff_flags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (new.active, new.is_admin) is distinct from (old.active, old.is_admin) then
    raise exception '権限の変更は管理者のみ可能です';
  end if;
  return new;
end $$;
create trigger staff_protect before update on public.staff
  for each row execute function public.protect_staff_flags();

-- ---------------------------------------------------------------------
-- 事務所の設定（1行だけ）
-- ---------------------------------------------------------------------
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  office_name text not null default '〇〇会計事務所',
  long_term_days int not null default 30,
  label_size text not null default 'a5',
  pdf_email text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.app_settings(id) values (1);

-- ---------------------------------------------------------------------
-- 預かり記録
-- ---------------------------------------------------------------------
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  no text unique,
  client_name text not null,
  handed_by text not null default '',
  items jsonb not null default '[]',
  purpose text not null default '',
  received_at timestamptz not null default now(),
  staff_name text not null,
  location text not null default '',
  expected_return date,
  memo text not null default '',
  signature text not null,
  photos text[] not null default '{}', -- 預かり時の写真（Storage 上のパス）
  hash text not null default '',
  label_printed_at timestamptz,
  label_printed_by text not null default '',
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deposits_client_idx on public.deposits(client_name);
create index deposits_received_idx on public.deposits(received_at desc);

-- 預かり番号を年ごとの連番（2026-0001）で振る
create or replace function public.assign_deposit_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare y text := to_char(new.received_at at time zone 'Asia/Tokyo', 'YYYY'); n int;
begin
  perform pg_advisory_xact_lock(hashtext('deposit_no_' || y));
  select coalesce(max(split_part(no, '-', 2)::int), 0) + 1 into n
    from public.deposits where no like y || '-%';
  new.no := y || '-' || lpad(n::text, 4, '0');
  return new;
end $$;
create trigger deposits_assign_no before insert on public.deposits
  for each row execute function public.assign_deposit_no();

-- サイン・写真とともに記録した内容は変更不可（保管場所・返却予定日・メモ・印刷済みの記録だけ変更可）
create or replace function public.protect_signed_deposit() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.no, new.client_name, new.handed_by, new.items, new.purpose, new.received_at,
      new.staff_name, new.signature, new.photos, new.hash, new.created_by, new.created_at)
     is distinct from
     (old.no, old.client_name, old.handed_by, old.items, old.purpose, old.received_at,
      old.staff_name, old.signature, old.photos, old.hash, old.created_by, old.created_at) then
    raise exception '署名済みの預かり内容は変更できません';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger deposits_protect before update on public.deposits
  for each row execute function public.protect_signed_deposit();

-- ---------------------------------------------------------------------
-- 返却記録（印刷済みの記録以外は変更不可・削除不可）
-- ---------------------------------------------------------------------
create table public.deposit_returns (
  id uuid primary key default gen_random_uuid(),
  deposit_id uuid not null references public.deposits(id),
  returned_at timestamptz not null default now(),
  staff_name text not null,
  recipient text not null default '',
  item_idx int[] not null,
  memo text not null default '',
  method text not null default 'hand' check (method in ('hand', 'courier', 'post')), -- 手渡し・宅配便・郵便
  carrier text not null default '', -- ヤマト運輸・簡易書留など
  tracking_no text not null default '',
  signature text not null, -- 手渡しのときのお客様の受領サイン（発送のときは空）
  photos text[] not null default '{}', -- 発送のときの伝票・郵便物の写真
  hash text not null default '',
  printed_at timestamptz,
  printed_by text not null default '',
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  -- 手渡しはお客様のサイン、発送は伝票・郵便物の写真のどちらかが必ずある
  constraint deposit_returns_proof check (signature <> '' or cardinality(photos) > 0)
);
create index deposit_returns_deposit_idx on public.deposit_returns(deposit_id);

create or replace function public.protect_signed_return() returns trigger
language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - 'printed_at' - 'printed_by') is distinct from (to_jsonb(old) - 'printed_at' - 'printed_by') then
    raise exception '署名済みの返却記録は変更できません';
  end if;
  return new;
end $$;
create trigger deposit_returns_protect before update on public.deposit_returns
  for each row execute function public.protect_signed_return();

-- ---------------------------------------------------------------------
-- 変更履歴（すべての登録・変更を記録）
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  action text not null,
  actor uuid default auth.uid(),
  at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(table_name, row_id, action, old_data, new_data)
  values (tg_table_name, coalesce(new.id, old.id), tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) - 'signature' end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) - 'signature' end);
  return coalesce(new, old);
end $$;
create trigger deposits_audit after insert or update or delete on public.deposits
  for each row execute function public.write_audit();
create trigger deposit_returns_audit after insert on public.deposit_returns
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------------
-- アクセスのルール（許可された職員だけが読み書きできる。削除は誰もできない）
-- ---------------------------------------------------------------------
alter table public.staff enable row level security;
alter table public.app_settings enable row level security;
alter table public.deposits enable row level security;
alter table public.deposit_returns enable row level security;
alter table public.audit_log enable row level security;

create policy staff_select on public.staff for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy staff_update_admin on public.staff for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy staff_update_self on public.staff for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy settings_select on public.app_settings for select to authenticated using (public.is_staff());
create policy settings_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy deposits_select on public.deposits for select to authenticated using (public.is_staff());
create policy deposits_insert on public.deposits for insert to authenticated with check (public.is_staff());
create policy deposits_update on public.deposits for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy returns_select on public.deposit_returns for select to authenticated using (public.is_staff());
create policy returns_insert on public.deposit_returns for insert to authenticated with check (public.is_staff());
create policy returns_update on public.deposit_returns for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy audit_select on public.audit_log for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 写真の保存先（非公開）。職員は見ることと追加だけでき、上書き・削除は誰もできない
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deposit-photos', 'deposit-photos', false, 10485760, array['image/jpeg']);

create policy deposit_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'deposit-photos' and public.is_staff());
create policy deposit_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'deposit-photos' and public.is_staff());

-- 内部用の関数は外から呼べないようにする
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.assign_deposit_no() from public, anon, authenticated;
revoke execute on function public.write_audit() from public, anon, authenticated;
revoke execute on function public.protect_staff_flags() from public, anon, authenticated;
revoke execute on function public.protect_signed_return() from public, anon, authenticated;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
