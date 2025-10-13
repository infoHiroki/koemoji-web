# 🔧 KoeMoji-Go Web 技術スタック

> **最終更新**: 2025-10-12
> **バージョン**: 1.0.0
> **ステータス**: 🟢 確定

---

## 📋 目次

1. [システムアーキテクチャ](#-システムアーキテクチャ)
2. [技術スタック詳細](#-技術スタック詳細)
3. [採用理由](#-採用理由)
4. [コスト構成](#-コスト構成)
5. [開発フロー](#-開発フロー)
6. [Phase別実装](#phase-phase別実装)

---

## 🏗️ システムアーキテクチャ

### 全体構成図

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│                  (既存: Vanilla JS)                      │
├─────────────────────────────────────────────────────────┤
│ ├─ popup/ (UI)                                          │
│ ├─ background.js (録音・API制御)                        │
│ ├─ lib/ (既存ライブラリ)                                │
│ │   ├─ audio-recorder.js                               │
│ │   ├─ audio-encoder.js                                │
│ │   ├─ openai-client.js                                │
│ │   └─ storage.js                                      │
│ └─ lib/supabase-client.js (新規追加)                    │
└─────────────────────────────────────────────────────────┘
                      ↓ HTTPS
┌─────────────────────────────────────────────────────────┐
│              Supabase Edge Functions                     │
│                 (Deno + TypeScript)                      │
├─────────────────────────────────────────────────────────┤
│ Phase 1:                                                │
│ └─ verify-license.ts (ライセンス検証)                   │
│                                                         │
│ Phase 2:                                                │
│ ├─ verify-license.ts (既存)                            │
│ ├─ transcribe.ts (OpenAI Proxy)                        │
│ ├─ subscription.ts (サブスク管理)                       │
│ └─ stripe-webhook.ts (Stripe連携)                      │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│              Supabase Services                           │
├─────────────────────────────────────────────────────────┤
│ ├─ PostgreSQL (データ永続化)                            │
│ ├─ Auth (認証・認可) ← Phase 2                         │
│ ├─ Storage (音声ファイル) ← Phase 2 オプション         │
│ └─ Realtime (将来の拡張用)                              │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│                   External APIs                          │
├─────────────────────────────────────────────────────────┤
│ ├─ OpenAI Whisper API (文字起こし)                      │
│ ├─ OpenAI GPT-4 API (要約)                              │
│ └─ Stripe API (決済)                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 技術スタック詳細

### 1. フロントエンド（Chrome拡張）

| 要素 | 技術 | バージョン | 理由 |
|------|------|-----------|------|
| **コア言語** | Vanilla JavaScript | ES2022 | 既存コードベース維持、軽量、フレームワーク不要 |
| **Manifest** | Chrome Extension Manifest V3 | V3 | Chrome Web Store要件 |
| **UI** | HTML5/CSS3 | - | シンプル、高速レンダリング |
| **状態管理** | chrome.storage API | - | Chrome拡張標準、同期機能 |
| **音声処理** | Web Audio API | - | ブラウザ標準、録音機能 |
| **API通信** | Fetch API | - | 標準API、追加ライブラリ不要 |

#### ディレクトリ構成

```
koemoji-web/
├─ manifest.json
├─ background.js
├─ content.js
├─ popup/
│   ├─ popup.html
│   ├─ popup.js
│   └─ popup.css
├─ settings/
│   ├─ settings.html
│   ├─ settings.js
│   └─ settings.css
├─ lib/
│   ├─ audio-recorder.js (既存)
│   ├─ audio-encoder.js (既存)
│   ├─ openai-client.js (既存)
│   ├─ storage.js (既存)
│   └─ supabase-client.js (新規追加)
└─ icons/
    ├─ icon-16.png
    ├─ icon-48.png
    └─ icon-128.png
```

#### 新規追加コード

```javascript
// lib/supabase-client.js
class SupabaseClient {
  constructor() {
    this.url = 'https://xxx.supabase.co'
    this.anonKey = 'public-anon-key'
  }

  async callFunction(functionName, data) {
    const response = await fetch(
      `${this.url}/functions/v1/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.anonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      }
    )
    return await response.json()
  }

  // Phase 1
  async verifyLicense(licenseKey) {
    return await this.callFunction('verify-license', { license_key: licenseKey })
  }

  // Phase 2
  async transcribe(audioBlob, options = {}) {
    const formData = new FormData()
    formData.append('audio', audioBlob)
    formData.append('options', JSON.stringify(options))

    const response = await fetch(
      `${this.url}/functions/v1/transcribe`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.anonKey}` },
        body: formData
      }
    )
    return await response.json()
  }
}
```

---

### 2. バックエンド（API層）

| 要素 | 技術 | バージョン | 理由 |
|------|------|-----------|------|
| **実行環境** | Supabase Edge Functions | - | サーバーレス、グローバルエッジ、低コスト |
| **言語** | TypeScript | 5.x | 型安全、最新JS機能、Chrome拡張と統一 |
| **ランタイム** | Deno | 1.x | セキュア、モダン、TypeScript標準サポート |
| **API形式** | REST | - | シンプル、Chrome拡張と相性良い |
| **認証** | Supabase Auth | - | 統合、JWT標準、メール認証 |

#### ディレクトリ構成

```
koemoji-web/
└─ supabase/
    ├─ config.toml
    ├─ migrations/
    │   └─ 20250101000000_initial_schema.sql
    └─ functions/
        ├─ verify-license/
        │   └─ index.ts
        ├─ transcribe/
        │   └─ index.ts
        ├─ subscription/
        │   └─ index.ts
        └─ stripe-webhook/
            └─ index.ts
```

#### Edge Function実装例

```typescript
// supabase/functions/verify-license/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { license_key } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_KEY') ?? ''
  )

  const { data, error } = await supabase
    .from('licenses')
    .select('*')
    .eq('license_key', license_key)
    .eq('active', true)
    .single()

  if (error || !data) {
    return new Response(
      JSON.stringify({ valid: false }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ valid: true, tier: 'pro', email: data.email }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
```

---

### 3. データベース

| 要素 | 技術 | バージョン | 理由 |
|------|------|-----------|------|
| **RDBMS** | PostgreSQL | 15 | Supabase統合、リレーショナル、高パフォーマンス |
| **クライアント** | Supabase JS Client | 2.x | 型安全、自動生成、リアルタイム |
| **マイグレーション** | Supabase CLI | - | バージョン管理、ロールバック可能 |
| **セキュリティ** | Row Level Security (RLS) | - | PostgreSQL標準、データ保護 |

#### データベーススキーマ

```sql
-- supabase/migrations/20250101000000_initial_schema.sql

-- ユーザーテーブル
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  tier VARCHAR(50) DEFAULT 'free', -- 'free', 'premium', 'pro'
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_email (email),
  INDEX idx_tier (tier)
);

-- ライセンステーブル（Phase 1: 買い切り）
CREATE TABLE licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  license_key VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  tier VARCHAR(50) DEFAULT 'pro',
  active BOOLEAN DEFAULT TRUE,
  purchased_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_license_key (license_key),
  INDEX idx_email (email),
  INDEX idx_active (active)
);

-- サブスクリプションテーブル（Phase 2）
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),

  tier VARCHAR(50) NOT NULL, -- 'premium', 'pro'
  status VARCHAR(50) NOT NULL, -- 'trial', 'active', 'canceled', 'past_due'

  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,

  cancel_at TIMESTAMP,
  canceled_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_stripe_subscription_id (stripe_subscription_id)
);

-- 使用量ログテーブル（Phase 2）
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  type VARCHAR(50) NOT NULL, -- 'transcription', 'summary'
  duration_seconds INTEGER,
  api_cost DECIMAL(10, 4), -- APIコスト（ドル）

  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  INDEX idx_type (type)
);

-- 月間使用量集計（マテリアライズドビュー）
CREATE MATERIALIZED VIEW monthly_usage AS
SELECT
  user_id,
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS transcription_count,
  SUM(duration_seconds) AS total_duration_seconds,
  SUM(api_cost) AS total_api_cost
FROM usage_logs
WHERE type = 'transcription'
GROUP BY user_id, DATE_TRUNC('month', created_at);

CREATE UNIQUE INDEX ON monthly_usage (user_id, month);

-- 文字起こし履歴テーブル（Phase 2）
CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  title VARCHAR(255),
  duration_seconds INTEGER NOT NULL,

  transcript TEXT NOT NULL,
  summary TEXT,

  timestamps JSONB, -- タイムスタンプ情報（Premium/Proのみ）
  metadata JSONB DEFAULT '{}'::jsonb,

  audio_file_url TEXT, -- Supabase Storage URL（オプション）

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

-- RLS（Row Level Security）設定
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のデータのみアクセス可能
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can read own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own transcriptions" ON transcriptions
  FOR SELECT USING (auth.uid() = user_id);
```

---

### 4. 認証・認可

| 要素 | 技術 | 理由 |
|------|------|------|
| **Phase 1** | ライセンスキー検証 | シンプル、買い切り型に適合 |
| **Phase 2** | Supabase Auth (JWT) | メール認証、パスワードレス、標準 |
| **セッション管理** | JWT Token | ステートレス、スケーラブル |
| **アクセス制御** | Row Level Security | PostgreSQL標準、強固 |

#### 認証フロー

```
Phase 1（買い切り）:
┌─────────────────────────────────────┐
│ 1. ユーザーがStripeで購入           │
│ 2. Webhookでライセンス生成          │
│ 3. メールでライセンスキー送付       │
│ 4. Chrome拡張でライセンス入力       │
│ 5. Edge Functionで検証              │
│ 6. Pro機能有効化                    │
└─────────────────────────────────────┘

Phase 2（サブスクリプション）:
┌─────────────────────────────────────┐
│ 1. ユーザーがメールアドレス登録     │
│ 2. Supabase Authでユーザー作成      │
│ 3. Stripeで決済                     │
│ 4. Webhookでサブスク有効化          │
│ 5. JWTトークンでAPI認証             │
│ 6. RLSで自動アクセス制御            │
└─────────────────────────────────────┘
```

---

### 5. 決済

| 要素 | 技術 | 用途 |
|------|------|------|
| **Phase 1** | Stripe Checkout (Payment Links) | 買い切り決済 |
| **Phase 2** | Stripe Subscriptions | 定期課金 |
| **Webhook** | Supabase Edge Functions | イベント処理 |

#### Stripe統合

```typescript
// supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient()
})

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  const body = await req.text()

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
    )

    switch (event.type) {
      case 'checkout.session.completed':
        // Phase 1: ライセンス発行
        await handleCheckoutCompleted(event.data.object)
        break

      case 'customer.subscription.created':
        // Phase 2: サブスク有効化
        await handleSubscriptionCreated(event.data.object)
        break

      case 'customer.subscription.deleted':
        // Phase 2: サブスク無効化
        await handleSubscriptionDeleted(event.data.object)
        break
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400 }
    )
  }
})
```

---

### 6. ホスティング・インフラ

| 要素 | サービス | 用途 | 理由 |
|------|---------|------|------|
| **Chrome拡張** | Chrome Web Store | 配信 | 標準配信チャネル |
| **API** | Supabase Edge Functions | グローバルエッジ実行 | 低レイテンシ、自動スケーリング |
| **データベース** | Supabase PostgreSQL | データ永続化 | 統合、バックアップ自動 |
| **ファイルストレージ** | Supabase Storage | 音声ファイル | S3互換、CDN統合 |
| **DNS** | Cloudflare | ドメイン管理 | DDoS保護、無料 |

---

### 7. 外部API

| API | 用途 | Phase | 料金 |
|-----|------|-------|------|
| **OpenAI Whisper** | 音声→テキスト | 1 & 2 | $0.006/分 |
| **OpenAI GPT-4o-mini** | テキスト要約 | 1 & 2 | $0.150/1M input tokens |
| **Stripe** | 決済処理 | 1 & 2 | 3.6%/件 |

---

### 8. 開発・デプロイツール

| ツール | 用途 | コマンド |
|--------|------|---------|
| **Supabase CLI** | ローカル開発、デプロイ | `supabase start`, `supabase deploy` |
| **Git** | バージョン管理 | `git commit`, `git push` |
| **npm/pnpm** | パッケージ管理 | `npm install` |
| **Chrome Web Store CLI** | 拡張配信 | `webstore upload` |

---

## ✅ 採用理由

### KISS・YAGNI・DRY原則との整合性

#### KISS（Keep It Simple, Stupid）

```
✅ シンプル:
- サービス1つ（Supabase）で完結
- 言語統一（TypeScript/JavaScript）
- 設定ファイル最小
- デプロイコマンド1つ

❌ 複雑（不採用）:
- Next.js + Vercel + PostgreSQL + Redis + S3
- マイクロサービス
- Kubernetes
```

#### YAGNI（You Aren't Gonna Need It）

```
✅ 必要なものだけ:
Phase 1:
├─ Edge Function 1つ（verify-license）
├─ テーブル 2つ（users, licenses）
└─ Stripe連携

Phase 2:
├─ Edge Functions 追加（transcribe, subscription）
├─ テーブル追加使用（subscriptions, usage_logs）
└─ Supabase Auth有効化

❌ 不要なもの（不採用）:
- SSR（サーバーサイドレンダリング）
- Redis（キャッシュ）
- CDN（Supabase内蔵）
- 話者識別（技術的に厳しい）
```

#### DRY（Don't Repeat Yourself）

```
✅ 重複排除:
- 型定義自動生成（supabase gen types）
- 認証ロジック一元化（Supabase Auth）
- APIクライアント共通化（SupabaseClient）
- 環境変数1ファイル（.env）

❌ 重複が多い（不採用）:
- フロントとバックで型定義重複
- 認証ロジック複数箇所
- バリデーション重複
```

---

### 技術選定の決め手

#### ✅ Supabaseを選んだ理由

1. **統合性**: DB + Auth + Storage + Edge Functions
2. **低コスト**: Phase 1で$25/月、Phase 2で$85/月
3. **移行コストゼロ**: 最初から最終形のアーキテクチャ
4. **開発速度**: CLI一つで全て管理
5. **スケーラビリティ**: 自動スケーリング、グローバルエッジ
6. **TypeScript統一**: Chrome拡張と言語統一

#### ❌ 不採用の技術と理由

| 技術 | 不採用の理由 |
|------|------------|
| **Next.js** | SSR不要、オーバースペック、$45/月と高コスト |
| **Firebase** | NoSQL（複雑なクエリ困難）、Phase 2で移行必要 |
| **AWS Lambda** | 設定複雑、コールドスタート遅い（3-5秒） |
| **Express + VPS** | サーバー管理必要、スケーリング手動 |
| **話者識別** | 技術的に厳しい、現状の設計では実現困難 |

---

## 💰 コスト構成

### Phase 1（買い切り型MVP）

```
Supabase Free Tier で十分:
├─ Database: 500MB（十分）
├─ Bandwidth: 2GB/月（十分）
├─ Edge Functions: 500K invocations/月（十分）
├─ MAU: 50,000（十分）
└─ Storage: 1GB

Phase 1の実際の使用量:
├─ ユーザー数: 50-100人
├─ ライセンス検証API: 月3,000回程度
├─ データベースサイズ: <10MB
└─ Bandwidth: <100MB/月

月間コスト:
├─ Supabase Free: $0
├─ Stripe手数料: 3.6%/件（購入時のみ）
└─ 合計: $0/月 🎉

収益性（50人購入想定）:
├─ 収入: ¥2,980 × 50 = ¥149,000
├─ コスト: ¥0 + Stripe手数料(¥5,364)
└─ 純利益: ¥143,636（96%マージン）
```

### Phase 2（フリーミアム）

#### 初期段階（100有料ユーザー）- 無料枠内

```
Supabase Free Tier（まだ無料で使える）:
├─ 総ユーザー: 500人（無料400 + 有料100）
├─ API呼び出し: 月30,000回（500K以内）
├─ Database: 50MB（500MB以内）
└─ Bandwidth: 500MB（2GB以内）

月間コスト:
├─ Supabase Free: $0
├─ OpenAI API: $30-50/月（変動）
│   ├─ Whisper: $0.006/分 × 3,000分 = $18
│   └─ GPT-4o-mini: $12-32
├─ Stripe手数料: 3.6%
└─ 合計: $30-50/月 ≈ ¥5,000-8,000/月

収益性（100有料ユーザー）:
├─ Premium（80人）: ¥1,480 × 80 = ¥118,400
├─ Pro（20人）: ¥3,980 × 20 = ¥79,600
├─ 合計: ¥198,000
├─ コスト: ¥8,000 + Stripe手数料(¥7,128)
└─ 純利益: ¥182,872/月（92%マージン）
```

#### 成長段階（1,000有料ユーザー）- Supabase Pro必要

```
Supabase無料枠超過（Pro移行）:
├─ 総ユーザー: 5,000人超
├─ API呼び出し: 500K超/月
└─ Database: 500MB超

月間コスト:
├─ Supabase Pro: $25/月
├─ Edge Functions超過: $2/100万req
├─ OpenAI API: $200-300/月（変動）
├─ Storage: $5/月
├─ Stripe手数料: 3.6%
└─ 合計: $232-332/月 ≈ ¥35,000-50,000/月

収益性（1,000有料ユーザー）:
├─ Premium（800人）: ¥1,184,000
├─ Pro（200人）: ¥796,000
├─ 合計: ¥1,980,000
├─ コスト: ¥50,000 + Stripe手数料(¥71,280)
└─ 純利益: ¥1,858,720/月（94%マージン）
```

### スケール時のコスト予測

| ステージ | 総ユーザー | 有料ユーザー | Supabase | 月額コスト | 月間収益 | 純利益 | マージン |
|---------|-----------|------------|---------|----------|---------|--------|---------|
| **Phase 1** | 50-100 | 50 | Free | ¥0 | ¥149,000 | ¥143,636 | 96% |
| **Phase 2初期** | 500 | 100 | Free | ¥8,000 | ¥198,000 | ¥182,872 | 92% |
| **Phase 2成長** | 2,000 | 400 | Free | ¥15,000 | ¥792,000 | ¥762,480 | 96% |
| **Pro移行** | 5,000 | 1,000 | Pro | ¥50,000 | ¥1,980,000 | ¥1,858,720 | 94% |
| **スケール** | 10,000 | 2,000 | Pro | ¥80,000 | ¥3,960,000 | ¥3,737,440 | 94% |

**重要**: Supabase無料枠は総ユーザー5,000人まで使用可能。それ以降はPro（$25/月）へ移行。

---

## 🔄 開発フロー

### ローカル開発環境

```bash
# Supabase CLIインストール
npm install -g supabase

# プロジェクト初期化
supabase init

# ローカルでSupabase起動（PostgreSQL + Edge Functions）
supabase start

# マイグレーション作成
supabase migration new initial_schema

# マイグレーション適用
supabase db push

# Edge Function作成
supabase functions new verify-license

# Edge Functionローカル実行
supabase functions serve verify-license

# 型定義自動生成
supabase gen types typescript --local > lib/database.types.ts
```

### デプロイフロー

```bash
# Supabaseプロジェクトと連携
supabase link --project-ref your-project-ref

# マイグレーション適用（本番）
supabase db push --linked

# Edge Functionデプロイ
supabase functions deploy verify-license

# 環境変数設定
supabase secrets set OPENAI_API_KEY=sk-xxx
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx

# ログ確認
supabase functions logs verify-license
```

### Git管理

```bash
# .gitignore
.env
.supabase/
node_modules/

# 管理対象
supabase/migrations/
supabase/functions/
supabase/config.toml
```

---

## 📅 Phase別実装

### Phase 1: 買い切り型MVP（2ヶ月）

**投資**: ¥0（Supabase無料枠）
**目標収益**: ¥149,000（50人購入）

#### Week 1-2: Supabase基盤構築

```
タスク:
├─ Supabaseプロジェクト作成（Free Tier）
├─ データベーススキーマ作成
│   ├─ users
│   ├─ licenses
│   ├─ subscriptions（Phase 2用、空テーブル）
│   └─ transcriptions（Phase 2用、空テーブル）
├─ verify-license Edge Function実装
└─ ローカルテスト環境構築

成果物:
├─ supabase/migrations/001_initial.sql
└─ supabase/functions/verify-license/index.ts
```

#### Week 3-4: Chrome拡張統合

```
タスク:
├─ lib/supabase-client.js実装
├─ settings.jsでライセンス検証フロー実装
├─ Pro機能の実装
│   ├─ カスタム要約テンプレート保存
│   ├─ 履歴エクスポート（CSV/JSON）
│   └─ Notion連携（基本版）
└─ UI/UX調整

成果物:
├─ lib/supabase-client.js
└─ 更新されたsettings.js
```

#### Week 5-6: 決済統合

```
タスク:
├─ Stripe Checkoutセットアップ
├─ Payment Link作成
├─ stripe-webhook Edge Function実装
├─ ライセンス自動発行ロジック
└─ メール送信（SendGrid/Resend）

成果物:
├─ supabase/functions/stripe-webhook/index.ts
└─ Stripe設定完了
```

#### Week 7-8: テスト・ローンチ

```
タスク:
├─ E2Eテスト
├─ Chrome Web Store申請準備
│   ├─ スクリーンショット作成
│   ├─ プライバシーポリシー更新
│   └─ ストア説明文作成
├─ ローンチ準備
│   ├─ Product Hunt投稿準備
│   └─ プレスリリース作成
└─ 本番デプロイ

成果物:
├─ Chrome Web Store公開
└─ Product Huntローンチ
```

---

### Phase 2: フリーミアム移行（3-6ヶ月後）

#### Month 1: バックエンドAPI拡張

```
タスク:
├─ Supabase Auth有効化
├─ transcribe Edge Function実装
├─ subscription Edge Function実装
├─ Stripe Subscriptions統合
├─ 使用量トラッキング実装
└─ RLS（Row Level Security）設定

成果物:
├─ supabase/functions/transcribe/index.ts
├─ supabase/functions/subscription/index.ts
└─ Auth設定完了
```

#### Month 2: 機能拡充

```
タスク:
├─ 高度な検索機能
│   └─ PostgreSQL全文検索
├─ カスタム要約テンプレート（高度版）
├─ タイムスタンプ付き文字起こし
├─ エクスポート機能強化
└─ Notion連携（高度版）

成果物:
├─ 検索UI
└─ 拡張機能実装
```

#### Month 3: テスト・移行

```
タスク:
├─ 既存ユーザー（Phase 1購入者）の移行計画
├─ Phase 1ユーザーへの特典付与
│   └─ 1年間Premium無料
├─ フリーミアムモードでのテスト
├─ A/Bテスト準備
└─ ローンチ

成果物:
├─ 移行完了
└─ フリーミアムローンチ
```

---

## 🎯 開発優先度

### 🔴 Critical（Phase 1必須）

```
1. Supabaseセットアップ
2. verify-license Edge Function
3. ライセンステーブル
4. Stripe Checkout統合
5. Webhook処理
```

### 🟡 Important（Phase 1推奨）

```
6. Pro機能（カスタムテンプレート）
7. エクスポート機能
8. Notion連携（基本）
9. UI改善
10. ドキュメント整備
```

### 🟢 Nice to Have（Phase 2以降）

```
11. 高度な検索
12. タイムスタンプ
13. リアルタイム文字起こし
14. チーム機能
15. Slack連携
```

---

## 📚 関連ドキュメント

- [フリーミアム実装詳細](./FREEMIUM_IMPLEMENTATION.md)
- [サブスクリプションモデル比較](./SUBSCRIPTION_MODELS.md)
- [アーキテクチャ設計](./ARCHITECTURE.md)
- [セットアップガイド](./SETUP_GUIDE.md)

---

## 🔄 更新履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|---------|
| 2025-10-12 | 1.0.0 | 初版作成、技術スタック確定 |

---

**最終更新**: 2025-10-12
**バージョン**: 1.0.0
**ステータス**: 🟢 確定
**次のステップ**: Phase 1実装開始
