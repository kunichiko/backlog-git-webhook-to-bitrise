# backlog-bitrise-webhook

Backlog Git の Webhook を受け取り、Bitrise のビルドをトリガーするための
AWS Lambda です。

Backlog は Bitrise の Webhook フォーマットに直接対応していないため、この
Lambda が **Backlog → Bitrise の中継**を行います。

```
Backlog
↓
webhook API Gateway
↓
Lambda
↓
Bitrise webhook
```

## 特徴

-   Backlog Git Webhook に対応
-   Bitrise GitHub webhook 形式に変換して中継
-   AWS Lambda + API Gateway (HTTP API) で動作
-   AWS SAM テンプレート付き
-   **1つのデプロイで複数の Backlog アカウント・プロジェクトに対応可能**
-   **複数の Bitrise プロジェクトにも対応可能**
-   ブランチへの push のみ中継（タグ push は無視）
-   MIT License

Webhook URL にはリクエストごとに Bitrise の hook パスを含めるため、
Lambda を 1 つデプロイするだけでチーム内の複数プロジェクトをまとめて
中継できます。Backlog 側の各リポジトリで Webhook URL の
`{project_slug}/{token}` 部分を対象の Bitrise プロジェクトに合わせて
設定してください。

## 必要なもの

-   AWS アカウント
-   AWS CLI
-   AWS SAM CLI
-   Bitrise プロジェクト

SAM CLI のインストール（macOS）

    brew install aws-sam-cli

## デプロイ方法

### デプロイ先の AWS アカウントを確認する

SAM CLI は AWS CLI の認証情報を使用します。デプロイ前に、意図した
AWS アカウントが選択されていることを確認してください。

    aws sts get-caller-identity

出力の `Account` フィールドがデプロイ先のアカウント ID です。

別のアカウントにデプロイしたい場合は、AWS CLI の**名前付きプロファイル**
を使って切り替えます。まだプロファイルがない場合は以下で作成できます。

    aws configure --profile my-profile

対話形式で以下を入力します。

-   AWS Access Key ID
-   AWS Secret Access Key
-   Default region name（例: `ap-northeast-1`）
-   Default output format（`json` のままで OK）

作成済みのプロファイルに切り替えるには `AWS_PROFILE` 環境変数を設定します。

    export AWS_PROFILE=my-profile
    aws sts get-caller-identity   # 切り替わったことを確認

### デプロイ手順

このリポジトリをクローンします。

    git clone https://github.com/kunichiko/backlog-git-webhook-to-bitrise.git
    cd backlog-git-webhook-to-bitrise

SAM を使ってデプロイします。

    sam deploy --guided

対話形式でいくつか質問されます。以下を参考に入力してください。

| 質問 | 推奨値 | 説明 |
|---|---|---|
| Stack Name | `backlog-to-bitrise-proxy-prod` など | CloudFormation のスタック名。わかりやすい名前を付けてください |
| AWS Region | `ap-northeast-1` | 東京リージョンの場合 |
| Confirm changes before deploy | `y` | デプロイ前に変更内容を確認できます |
| Allow SAM CLI IAM role creation | `y` | Lambda 実行用の IAM ロールを自動作成します |
| Disable rollback | `N`（デフォルト） | デプロイ失敗時に自動ロールバックします |
| BacklogWebhookFunction has no authentication. Is this okay? | **`y`** | API Gateway レベルの認証は付けません。認証は Lambda 内で URL の secret パラメータを検証する方式のため、ここは `y` で問題ありません |
| Save arguments to configuration file | `Y`（デフォルト） | 次回以降 `sam deploy` だけで済むよう設定を保存します |
| SAM configuration file | `samconfig.toml`（デフォルト） | そのまま Enter |
| SAM configuration environment | `default`（デフォルト） | そのまま Enter |

デプロイ完了後、SECRET の値を設定します。コマンドラインで `uuidgen` などを実行して UUID を生成し、それを使うのがおすすめです。

    aws lambda update-function-configuration \
      --function-name backlog-to-bitrise-proxy \
      --environment "Variables={SECRET=ここにUUIDを入れる,DELAY_SECONDS=5}"

この SECRET の値は後で Webhook URL に使うのでメモしておいてください。

## アップデート方法

既にデプロイ済みの環境を更新する場合は、最新のコードを取得して
再デプロイするだけです。

    git pull
    sam deploy

初回の `sam deploy --guided` 実行時にデプロイ設定（スタック名・
リージョン・パラメータなど）が `samconfig.toml` に保存されます。
2回目以降は `samconfig.toml` が参照されるため `--guided` は不要です。

`samconfig.toml` が存在しない場合（別のマシンにクローンし直した
場合など）は、再度 `sam deploy --guided` を実行してください。
前回と同じ Stack Name と Region を指定すれば既存の Lambda が
更新されます（新規作成にはなりません）。

Stack Name を忘れた場合は、AWS CLI で確認できます。

    aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
      --query "StackSummaries[].StackName" --output table

`backlog` などの名前で作成していれば一覧から見つかるはずです。

## Webhook URL

デプロイ完了後、`sam deploy` の出力の末尾に Webhook URL のテンプレートが
表示されます。形式は次の通りです。

    https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/default/backlog-to-bitrise-proxy/{secret}/{project_slug}/{token}

-   `{secret}` — SAM デプロイ時に決めた認証用トークン（UUID など）
-   `{project_slug}` — Bitrise の Project slug（後述）
-   `{token}` — Bitrise の Token（後述）

## Backlog 側の設定

Backlog の Git リポジトリ設定から Webhook を追加します。

Webhook URL に上記 URL を設定してください。

## Bitrise 側の設定

Bitrise のプロジェクト設定 → Code → Incoming Webhooks で
「SETUP MANUALLY」から GitHub を選ぶと、以下の 2 つの値が表示されます。

-   **Project slug** — プロジェクトを識別する ID
-   **Token** — ビルドトリガー用のトークン

この 2 つの値を上記 Webhook URL の `{project_slug}` と `{token}` に
それぞれ当てはめてください。

これらの値はビルドをトリガーできるトークンを含むため、
第三者に公開しないでください。

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `SECRET` | はい | — | Webhook 認証用トークン。推測されにくい長いランダム文字列を設定してください |
| `DELAY_SECONDS` | いいえ | `5` | Bitrise へ転送する前の待機秒数。Backlog の Git 同期が間に合わない場合に調整してください。`0` で即時転送。Lambda の Timeout（デフォルト 30秒）より小さい値にしてください。Timeout を超えると Lambda ごとタイムアウトします |

## 動作確認

### 1. SECRET の検証が動いているか確認する

わざと間違った SECRET で叩いて、403 が返ることを確認します。

    curl -i -X POST \
      -H "content-type: application/json" \
      -d '{}' \
      https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/backlog-to-bitrise-proxy/WRONG_SECRET/00000000-0000-0000-0000-000000000000/AAAAAAAAAA

`HTTP/1.1 403 Forbidden` が返れば OK です。

### 2. Lambda が正常に動作するか確認する

正しい SECRET で空の JSON を送り、200 が返ることを確認します。

    curl -i -X POST \
      -H "content-type: application/json" \
      -d '{}' \
      https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/backlog-to-bitrise-proxy/YOUR_SECRET/{project_slug}/{token}

`HTTP/1.1 200 OK` が返れば Lambda は正常に動作しています。
ただし空の JSON ではビルドはトリガーされません。

### 3. 手動でビルドをトリガーしたい場合

テスト用の JSON を送ることで、Backlog に push しなくてもビルドを
トリガーできます。`ref` のブランチ名は Bitrise 側でトリガー対象に
設定しているものに合わせてください。

    curl -i -X POST \
      -H "content-type: application/json" \
      -d '{
        "ref": "refs/heads/main",
        "before": "0000000000000000000000000000000000000000",
        "after": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "repository": { "name": "test-repo" },
        "revisions": [{ "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "message": "test commit" }]
      }' \
      https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/backlog-to-bitrise-proxy/YOUR_SECRET/{project_slug}/{token}

Bitrise のダッシュボードでビルドが開始されれば成功です。

### 4. 実際に Bitrise のビルドを確認する

Backlog の Git リポジトリに push すると、Webhook 経由で Bitrise の
ビルドが自動的に開始されます。Bitrise のダッシュボードでビルドが
開始されることを確認してください。

## セキュリティ

-   URL に secret を含むため、第三者に漏れないようにしてください
-   CloudWatch Logs にコミット情報が出る場合があります
-   必要に応じてログ出力を制限してください

## ライセンス

MIT License
