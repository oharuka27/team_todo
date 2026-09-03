# チーム ToDoアプリ

チームでToDoを共有できるリアルタイム更新対応のプロジェクト管理アプリです。

## 🎯 機能

### フロントエンド
- **プロジェクト管理**: オーナー／メンバープロジェクトの分類、作成・一覧表示・選択
- **メンバー管理**: オーナーによるメンバー追加・削除、メンバー自身による脱退、初回招待通知
- **カンバンボード**: 3列レイアウト（未着手/着手中/完了）でToDoを管理
- **列のカスタマイズ**: 各列のタイトルをユーザーが編集可能
- **ToDoの追加・削除**: リアルタイムな反映

### バックエンド
- **リアルタイム同期**: WebSocketによる複数ユーザーの同時接続対応
- **API驚エンドポイント**: CRUD操作用のRESTful API
- **CloudFlare Workers**: エッジでの実行による低レイテンシー
- **データ永続化**: SQLiteによるデータ管理

## 📁 プロジェクト構成

```
team_todo/
├── frontend/                    # React + TypeScript + Vite
│   ├── src/
│   │   ├── pages/              # ページコンポーネント
│   │   │   ├── HomePage.tsx    # プロジェクト一覧・作成
│   │   │   └── ProjectPage.tsx # カンバンボード
│   │   ├── styles/             # CSSファイル
│   │   ├── App.tsx             # メインコンポーネント
│   │   └── main.tsx            # エントリーポイント
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── backend/                     # CloudFlare Workers + Hono
│   ├── src/
│   │   └── index.ts            # バックエンド実装
│   ├── migrations/
│   │   └── 0001_create_todos.sql
│   ├── package.json
│   └── wrangler.jsonc
└── README.md
```

## 🚀 セットアップ

### 前提条件
- Node.js 18以上
- npm または pnpm

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

開発サーバーは `http://localhost:5173` で起動します。

### フロントエンドテスト

```bash
cd frontend
npm test
```

開発中にテストを監視実行する場合は `npm run test:watch` を使用します。

### バックエンドテスト

```bash
cd backend
npm test
```

### テスト結果のメール通知

GitHub Actionsは、push時にfrontend/backendのテスト件数と結果をメール送信します。リポジトリの `Settings` → `Secrets and variables` → `Actions` で、次のRepository secretsを設定してください。

- `MAIL_USERNAME`: 送信元のGmailアドレス
- `MAIL_PASSWORD`: Googleアカウントで発行したアプリパスワード

通常のGoogleアカウントパスワードは登録しないでください。メールは `xxx@gmail.com` 宛てに送信されます。

### バックエンド

```bash
cd backend
npm install
npm run dev
```

デバッグサーバーは `http://localhost:8787` で起動します。

## 📝 使用方法

### プロジェクト作成
1. ホームページのフォームでプロジェクト名を入力
2. 「作成」ボタンをクリック
3. プロジェクトが一覧に追加される

### ToDoの管理
1. プロジェクトをクリックして詳細ページに移動
2. 各列に新しいToDoを追加
3. ToDoをドラッグして別の列に移動
4. ✏️ボタンで列のタイトルを編集

### リアルタイム同期
- 複数ユーザーがアクセスしている場合、自動的に最新の状態に同期されます
- WebSocketを使用してリアルタイムな更新を実現

## 🔧 API エンドポイント

### ユーザーAPI

```
POST   /api/users                 # ニックネームを登録
GET    /api/users                 # ユーザー一覧取得
GET    /api/users/:id/project-notifications # 未確認のプロジェクト招待通知
POST   /api/users/:id/project-notifications/acknowledge # 招待通知を確認済みにする
```

### プロジェクトAPI

```
POST   /api/projects              # プロジェクト作成
GET    /api/projects              # プロジェクト一覧取得
GET    /api/projects/:id          # プロジェクト詳細取得
PUT    /api/projects/:id          # プロジェクト更新
DELETE /api/projects/:id          # プロジェクト削除
GET    /api/projects/:id/members  # プロジェクトメンバー一覧
POST   /api/projects/:id/members  # メンバー追加（オーナーのみ）
DELETE /api/projects/:id/members/:userId # メンバー削除（オーナーのみ）
POST   /api/projects/:id/leave    # メンバープロジェクトから脱退
```

### ToDoAPI

```
POST   /api/todos                 # ToDoアイテム作成
GET    /api/projects/:id/todos    # プロジェクトのToDoリスト取得
PUT    /api/todos/:id             # ToDoアイテム更新
DELETE /api/todos/:id             # ToDoアイテム削除
GET    /api/todos/:id/comments    # コメント一覧取得
POST   /api/todos/:id/comments    # コメント追加
```

### カラムAPI

```
GET    /api/projects/:id/columns  # プロジェクトの列一覧取得
PUT    /api/columns/:id           # 列のタイトル更新
```

## 🗄️ データベーススキーマ

### users テーブル
- `id`: ユーザーID（主キー）
- `nickname`: ニックネーム
- `created_at`: 作成日時
- `updated_at`: 更新日時

### projects テーブル
- `id`: プロジェクトID（主キー）
- `name`: プロジェクト名
- `description`: 説明
- `owner_id`: オーナーユーザーID
- `created_at`: 作成日時
- `updated_at`: 更新日時

### project_members テーブル
- `project_id`: プロジェクトID
- `user_id`: ユーザーID
- `role`: `owner` または `member`
- `created_at`: 追加日時
- `notified_at`: 招待通知の確認日時（未確認の場合はNULL）

### todos テーブル
- `id`: ToDoアイテムID（主キー）
- `project_id`: プロジェクトID（外部キー）
- `title`: タイトル
- `description`: 説明
- `status`: ステータス
- `column_name`: 列の名前
- `user_id`: 作成ユーザーID
- `assignee_id`: 担当ユーザーID
- `created_at`: 作成日時
- `updated_at`: 更新日時

### todo_comments テーブル
- `id`: コメントID（主キー）
- `todo_id`: 対象タスクID
- `user_id`: コメント投稿者ID
- `body`: コメント本文
- `created_at`: 作成日時

### board_columns テーブル
- `id`: 列ID（主キー）
- `project_id`: プロジェクトID（外部キー）
- `title`: 列のタイトル
- `position`: 表示位置
- `created_at`: 作成日時
- `updated_at`: 更新日時

## 🚢 CloudFlareへのデプロイ

```bash
cd backend
npm run deploy
```

フロントエンドは CloudFlare Pages や Vercel などにデプロイできます。

```bash
cd frontend
npm run build
# 生成された dist ディレクトリをデプロイ
```

## 🤝 マルチユーザー対応

- WebSocket接続によるリアルタイム同期
- 複数ユーザーの同時編集に対応
- 各ユーザーにはローカルストレージで自動的にIDを割り当て

## 📦 依存パッケージ

### フロントエンド
- React 18+
- TypeScript 5+
- Vite 5+

### バックエンド
- Hono 4+
- @hono/cors
- uuid
- Wrangler 3+ (CloudFlare Workers CLI)

## 📄 ライセンス

MIT License

## 🐛 トラブルシューティング

### フロントエンドが起動しない
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### バックエンド接続エラー
- CloudFlareにデプロイしていない場合、バックエンドはモック データを使用します
- 本番環境では環境変数を設定して、実際のバックエンドURLを指定します

## 📚 参考資料

- [Vite](https://vite.dev/)
- [React](https://react.dev/)
- [Hono](https://hono.dev/)
- [CloudFlare Workers](https://workers.cloudflare.com/)
- [SQLite](https://www.sqlite.org/)

---

**開発版**: このアプリは現在開発中です。新機能や改善が随時追加されます。
