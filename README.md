# チーム ToDoアプリ

チームでToDoを共有できるリアルタイム更新対応のプロジェクト管理アプリです。

- フロントエンド: https://team-todo.mitenecolab.com
- バックエンド: https://team-todo-backend.mitenecolab.workers.dev

## 🎯 機能

- **ログイン**: Clerk によるサインイン／サインアップ。初回ログイン時にニックネームを登録
- **プロジェクト管理**: オーナー／メンバープロジェクトの分類、作成・名前変更・削除
- **表示順変更**: オーナー／メンバーの各グループ内でドラッグ＆ドロップし、ユーザーごとの並び順を保存
- **メンバー管理**: オーナーによるメンバー追加・削除、メンバー自身による脱退、初回招待通知
- **カンバンボード**: 4列（To Do / In Progress / In Review / Done）でタスクを管理。列名はダブルクリックで変更可能
- **トピック**: プロジェクト内にトピックを作成し、トピック単位でタスクを整理（色の変更も可能）
- **タスク詳細**: 説明・担当者・トピック・コメント
- **検索とフィルター**: タスク名の検索、担当者での絞り込み
- **ユーザー設定**: ユーザー名と担当者アイコンの背景色を変更
- **リアルタイム同期**: Durable Objects と WebSocket Hibernation により、変更時だけ接続中のメンバーへ通知。プロジェクトが削除されたときは、操作を遮るポップアップで通知

## 📁 プロジェクト構成

```
team_todo/
├── frontend/                        # React + TypeScript + Vite
│   └── src/
│       ├── main.tsx                 # エントリーポイント（ClerkProvider）
│       ├── App.tsx                  # 認証ゲートとワークスペース（サイドバー・各ダイアログの切り替え）
│       ├── pages/ProjectPage.tsx    # カンバンボード・トピック画面
│       ├── components/              # 画面部品（ダイアログ、カンバン列、タスクカード、トピック など）
│       ├── hooks/useRealtimeSocket.ts # WebSocket の接続と自動再接続
│       ├── services/api.ts          # APIクライアント（Clerkトークンを付与）
│       └── utils/avatar.ts          # アバター表示の共通処理
├── backend/                         # Cloudflare Workers + Hono + D1
│   ├── src/
│   │   ├── index.ts                 # API・認証・Durable Object（RealtimeChannel）
│   │   ├── index.test.ts            # API のテスト
│   │   ├── migrations.test.ts       # マイグレーションのテスト
│   │   └── test/d1.ts               # テスト用 D1（SQLite + 全マイグレーション適用）
│   ├── migrations/                  # D1 マイグレーション（0001〜）
│   └── wrangler.jsonc
├── setup.sh                         # frontend / backend の依存パッケージをまとめてインストール
└── .github/workflows/               # CI（型チェック・lint・ユニットテスト・結果メール）
```

## 🚀 セットアップ

### 前提条件
- Node.js 22 以上（CI と同じバージョン）
- npm

`./setup.sh` で frontend / backend の依存パッケージをまとめてインストールできます。

### 認証（Clerk）

ログインには [Clerk](https://clerk.com/) を使用します。Clerk ダッシュボードでアプリケーションを作成し、APIキーを設定してください。

`frontend/.env.local`（Git管理外）:

```
VITE_API_URL=http://localhost:8787
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

`backend/.dev.vars`（Git管理外）:

```
CLERK_SECRET_KEY=sk_test_...
CLERK_AUTHORIZED_PARTIES=http://localhost:5173
```

- `CLERK_AUTHORIZED_PARTIES` はフロントエンドのオリジン（カンマ区切り）です。Clerk トークンの発行元チェックと CORS の許可リストの両方に使います。
- ローカルでは `http://localhost:5173` で開いてください（`127.0.0.1` では CORS で拒否されます）。

### 起動

```bash
# ターミナル1: バックエンド（ローカルD1のマイグレーションも実行）
cd backend && npm run dev     # http://localhost:8787

# ターミナル2: フロントエンド
cd frontend && npm run dev    # http://localhost:5173
```

### テスト・型チェック・lint

```bash
cd frontend && npm test && npm run typecheck && npm run lint
cd backend && npm test && npm run typecheck
```

- 開発中にテストを監視実行する場合は `npm run test:watch` を使用します。
- バックエンドのテストは、Node.js 組み込みの SQLite（`node:sqlite`）に `migrations/` をすべて適用したデータベースで実行します。実際の SQL とマイグレーションがそのまま検証されます。
- 依存パッケージを追加・更新するときは、CI と同じ npm 10 系で lock ファイルを更新してください（`npx npm@10 install`）。npm 11 で更新すると、CI の `npm ci` が失敗することがあります。

## 🔐 認証と権限

- API（`/api/*`）はすべて `Authorization: Bearer <Clerkセッショントークン>` が必要です。操作ユーザーはトークンから判定し、リクエストの `user_id` などは信用しません。
- WebSocket はヘッダーを送れないため、`?token=` クエリでトークンを渡します。
- プロジェクト配下のデータ（タスク・列・トピック・コメント・メンバー）は、そのプロジェクトのオーナーまたはメンバーだけが操作できます。
- プロジェクトの名前変更・削除とメンバーの追加・削除はオーナーだけが行えます。

## 🔧 API エンドポイント

### ユーザー

```
POST   /api/users                                        # ログイン中ユーザーのニックネームを登録
GET    /api/users/me                                     # ログイン中ユーザーの情報（未登録なら404）
GET    /api/users                                        # ユーザー一覧（メンバー追加の候補）
PUT    /api/users/:id                                    # ユーザー名・アイコン色の変更（本人のみ）
PUT    /api/users/:id/project-order                      # プロジェクトの表示順を保存（本人のみ）
GET    /api/users/:id/project-notifications              # 未確認の招待通知（本人のみ）
POST   /api/users/:id/project-notifications/acknowledge  # 招待通知を確認済みにする（本人のみ）
```

### プロジェクト・メンバー

```
POST   /api/projects                           # プロジェクト作成（標準の4列も作成）
GET    /api/projects                           # 自分がオーナー／メンバーのプロジェクト一覧
GET    /api/projects/:id                       # プロジェクト詳細
PUT    /api/projects/:id                       # プロジェクト更新（オーナーのみ）
DELETE /api/projects/:id                       # プロジェクト削除（オーナーのみ）
GET    /api/projects/:id/members               # メンバー一覧
POST   /api/projects/:id/members               # メンバー追加（オーナーのみ）
DELETE /api/projects/:id/members/:userId       # メンバー削除（オーナーのみ）
POST   /api/projects/:id/leave                 # メンバープロジェクトから脱退
```

### 列・トピック

```
GET    /api/projects/:id/columns               # 列一覧
PUT    /api/columns/:id                        # 列のタイトル変更
GET    /api/projects/:id/topics                # トピック一覧
POST   /api/projects/:id/topics                # トピック作成
PUT    /api/topics/:id                         # トピックの色変更
```

### タスク・コメント

```
POST   /api/todos                              # タスク作成（column_id が必要）
GET    /api/projects/:id/todos                 # プロジェクトのタスク一覧
PUT    /api/todos/:id                          # タスク更新（タイトル・説明・列・担当者・トピック）
DELETE /api/todos/:id                          # タスク削除（コメントも削除）
GET    /api/todos/:id/comments                 # コメント一覧
POST   /api/todos/:id/comments                 # コメント追加
```

### リアルタイム（WebSocket）

```
GET    /api/realtime/users/:userId             # ユーザー宛ての通知（招待・プロジェクト削除など）
GET    /api/realtime/projects/:projectId       # プロジェクト内の変更通知
```

## 🗄️ データベーススキーマ（D1）

| テーブル | 主な列 |
|---|---|
| `users` | `id`（Clerk ユーザーID）, `nickname`, `avatar_color`, `created_at`, `updated_at` |
| `projects` | `id`, `name`, `description`, `owner_id`, `created_at`, `updated_at` |
| `project_members` | `project_id`, `user_id`, `role`（`owner` / `member`）, `sort_order`（ユーザーごとの表示順）, `notified_at`（招待通知の確認日時）, `created_at` |
| `board_columns` | `id`, `project_id`, `title`, `position`, `created_at`, `updated_at` |
| `topics` | `id`, `project_id`, `name`, `color`, `created_at`, `updated_at` |
| `todos` | `id`, `project_id`, `column_id`, `column_name`（表示用のコピー）, `topic_id`, `title`, `description`, `status`（未使用）, `user_id`（作成者）, `assignee_id`, `created_at`, `updated_at` |
| `todo_comments` | `id`, `todo_id`, `user_id`, `body`, `created_at` |

スキーマの変更は `backend/migrations/` に連番の SQL を追加します。`npm run dev` / `npm run deploy` の実行時に自動で適用されます。

## 🚢 デプロイ

frontend / backend とも Cloudflare Workers Builds で GitHub と連携しており、`main` への push で自動的にビルド・デプロイされます。

| | ルートディレクトリ | ビルドコマンド | デプロイコマンド |
|---|---|---|---|
| バックエンド（`team-todo-backend`） | `/backend` | `npm run build`（型チェック） | `npm run deploy`（本番D1へのマイグレーション適用 → Worker のデプロイ） |
| フロントエンド（`team-todo`） | `/frontend` | `npm run build` | `npx wrangler deploy` |

- `package.json` の `build` / `deploy` スクリプトは Cloudflare のビルドから呼ばれるため、名前を変えたり削除したりしないでください。
- フロントエンドのビルド変数（Build variables）に `VITE_API_URL`（バックエンドの URL）と `VITE_CLERK_PUBLISHABLE_KEY`（本番用の `pk_live_...`）を設定しています。
- バックエンドの `CLERK_AUTHORIZED_PARTIES` は `wrangler.jsonc` の `vars` で管理しています。
- 本番用の Clerk シークレットは初回のみ登録します: `cd backend && npx wrangler secret put CLERK_SECRET_KEY --env=""`（`sk_live_...`）
- 手元から直接デプロイする場合は `cd backend && npm run deploy` を実行します。

frontend と backend は同時にビルドされるため、どちらが先に反映されるかは決まっていません。API やスキーマを変更するときは、新旧どちらの組み合わせでも動くように変更してください（例: 新しい項目は省略可能にして古いリクエストも受け付ける）。

## 📬 CI（GitHub Actions）

push と pull request のたびに、frontend / backend の型チェック・lint・ユニットテストを実行します。`main` への push では、結果をメールで送信します。リポジトリの `Settings` → `Secrets and variables` → `Actions` で、次の Repository secrets を設定してください。

- `MAIL_USERNAME`: 送信元の Gmail アドレス
- `MAIL_PASSWORD`: Google アカウントで発行したアプリパスワード（通常のパスワードは登録しない）
- `MAIL_TO`: 通知の送信先メールアドレス

## 📦 主な依存パッケージ

- フロントエンド: React 19, TypeScript, Vite 8, `@clerk/react`, Vitest, Testing Library, oxlint
- バックエンド: Hono 4, `@clerk/backend`, Wrangler 4, Vitest

## 🐛 トラブルシューティング

- **「読み込んでいます…」のまま進まない**: Clerk の初期化に失敗しています。`VITE_CLERK_PUBLISHABLE_KEY` を確認してください。本番では `clerk.mitenecolab.com` の DNS と SSL が有効である必要があります。
- **ログイン後に API が 401 になる**: バックエンドの `CLERK_SECRET_KEY` が、フロントのキーと同じ Clerk インスタンス（開発／本番）の `sk_...` か確認してください。
- **API が CORS で失敗する**: フロントのオリジンが `CLERK_AUTHORIZED_PARTIES` に含まれているか確認してください。
- **CI の `npm ci` が lock ファイルの不一致で失敗する**: lock ファイルを npm 10 系で更新し直してください（`npx npm@10 install`）。

## 📚 参考資料

- [Vite](https://vite.dev/) / [React](https://react.dev/) / [Hono](https://hono.dev/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) / [D1](https://developers.cloudflare.com/d1/)
- [Clerk](https://clerk.com/docs)

## 📄 ライセンス

MIT License
