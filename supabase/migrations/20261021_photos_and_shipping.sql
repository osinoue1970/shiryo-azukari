-- =====================================================================
-- 追加設定：写真で預かる／宅配便・郵便で返す（2026-10-21）
--
-- 2026年10月21日より前に setup.sql を実行した事務所だけが対象です。
-- Supabase の「SQL Editor」にこのファイルの中身を貼り付けて「Run」を1回押してください。
-- これから新しく導入する場合は setup.sql に含まれているので不要です。
-- =====================================================================

-- 預かり時の写真（Storage 上のパス）
alter table public.deposits add column photos text[] not null default '{}';

-- 返却方法（手渡し・宅配便・郵便）と発送の記録
alter table public.deposit_returns
  add column method text not null default 'hand' check (method in ('hand', 'courier', 'post')),
  add column carrier text not null default '',
  add column tracking_no text not null default '',
  add column photos text[] not null default '{}',
  -- 手渡しはお客様のサイン、発送は伝票・郵便物の写真のどちらかが必ずある
  add constraint deposit_returns_proof check (signature <> '' or cardinality(photos) > 0);

-- 預かり時の写真もサインと同じく変更不可にする
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

-- 写真の保存先（非公開）。職員は見ることと追加だけでき、上書き・削除は誰もできない
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deposit-photos', 'deposit-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy deposit_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'deposit-photos' and public.is_staff());
create policy deposit_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'deposit-photos' and public.is_staff());
