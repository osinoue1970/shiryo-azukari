# 資料 預かり・返却管理アプリ

会計事務所がお客様から資料を**預かるとき・返すとき**に、iPhone でその場でお客様のサインをもらって記録するアプリです。
記録はクラウドに保存され、事務所の PC から職員全員が一覧で確認できます。

## できること

| 場面 | 操作 |
| --- | --- |
| 預かる（iPhone） | 顧客名・資料を入力 → お客様にサインしてもらう →「預かりを登録しました」 |
| 返す（iPhone） | 返す資料にチェック（一部返却も可）→ 受領サイン →「返却を登録しました」 |
| 確認（PC） | 預かり中／長期／返却予定超過／返却済の一覧、検索、CSV出力 |
| 印刷（PC） | 「印刷待ち」から、資料に貼るラベルと返却確認書を B5 でまとめて印刷 |

- サインした記録は、データベース側で**書き換えも削除もできません**。
- 職員は職員登録のあと、**管理者が許可**すると使えるようになります。
- iPhone は Safari で開いて「ホーム画面に追加」すると、アプリのように使えます。

## 自分の事務所で使うには

**[導入手順書](docs/導入手順書.md)** を見ながら、次の3つを用意します（1〜2時間）。

1. Supabase（データの保存先）にプロジェクトを作り、[`supabase/setup.sql`](supabase/setup.sql) を1回実行する
2. Vercel（公開先）でアプリを公開し、接続用の値を2つ設定する
3. 所長が最初に職員登録する（最初の人が管理者になる）

手順2の公開は、このボタンから始められます（手順1が終わってから押してください）。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fosinoue1970%2Fshiryo-azukari&root-directory=app&project-name=shiryo-azukari&repository-name=shiryo-azukari&env=VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY&envDescription=Supabase%E3%81%AEProject%20URL%E3%81%A8Publishable%20key%EF%BC%88%E5%B0%8E%E5%85%A5%E6%89%8B%E9%A0%86%E6%9B%B8%E3%81%AE%E6%89%8B%E9%A0%864%EF%BC%89&envLink=https%3A%2F%2Fgithub.com%2Fosinoue1970%2Fshiryo-azukari%2Fblob%2Fmain%2Fdocs%2F%E5%B0%8E%E5%85%A5%E6%89%8B%E9%A0%86%E6%9B%B8.md)

## フォルダの中身

| 場所 | 内容 |
| --- | --- |
| `app/` | アプリ本体（Vite + React） |
| `app/api/` | PDF メール送信（任意） |
| `supabase/setup.sql` | データベースの初期設定 |
| `docs/導入手順書.md` | 導入の手順 |

## 開発者向け

```bash
cd app
cp .env.example .env.local   # 値を入れる
npm install
npm run dev
```

## 利用条件

- [MIT ライセンス](LICENSE)です。無償で自由に使用・改変・再配布できます。
- **無保証です。** このアプリの利用によって生じたいかなる損害についても、作成者は責任を負いません。
- データ（お客様情報・サイン）は、各事務所が用意した Supabase のアカウントに保存されます。バックアップや保管期間など、データの管理は各事務所の責任で行ってください。
