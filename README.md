# backlog-bitrise-webhook

Backlog Git の Webhook を受け取り、Bitrise のビルドをトリガーするための
AWS Lambda です。

Backlog は Bitrise の Webhook フォーマットに直接対応していないため、この
Lambda が **Backlog → Bitrise の中継**を行います。

Backlog ↓ webhook API Gateway ↓ Lambda ↓ Bitrise webhook

## 特徴

-   Backlog Git Webhook に対応
-   Bitrise GitHub webhook 形式に変換して中継
-   AWS Lambda + API Gateway (HTTP API) で動作
-   AWS SAM テンプレート付き
-   MIT License

## 必要なもの

-   AWS アカウント
-   AWS CLI
-   AWS SAM CLI
-   Bitrise プロジェクト

SAM CLI のインストール（macOS）

    brew install aws-sam-cli

## デプロイ方法

このリポジトリをクローンします。

    git clone https://github.com/kunichiko/backlog-git-webhook-to-bitrise.git
    cd backlog-bitrise-webhook

SAM を使ってデプロイします。

    sam deploy --guided

質問に答えると AWS にデプロイされます。途中で以下を入力します。

-   Stack Name
-   AWS Region
-   SECRET（Webhook 認証用トークン）

Stack Nameは AWS上の CloudFormationに作られるスタック名なので、`backlog-bitrise-webhook-prod` など、わかりやすい名前を入れてください。

AWS Regionは東京リージョンであれば `ap-northeast-1` を入れてください。

SECRETは、今回作る中継用のWebhookのURLに含める文字列です。これをランダムな長い文字列にしておけば、URLを見つけられるリスクが減ります。コマンドラインで `uuidgen` などを実行てUUIDを生成してそれを使うのがいいと思います。

この値は後で必要になりますのでメモしておいてください。

## Webhook URL

デプロイ完了後、API Gateway の Invoke URL が表示されます。Webhook URL
の形式は次の通りです。

    https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/default/backlog-git-webhook-to-bitrise/{secret}/{bitrise_hook_path}

-   `{secret}` — SAM デプロイ時に決めた認証用トークン（UUID など）
-   `{bitrise_hook_path}` — Bitrise が払い出す Webhook パス（後述）

例：

    https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/default/backlog-git-webhook-to-bitrise/YOUR_SECRET/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX/YYYYYYYYYYYY

## Backlog 側の設定

Backlog の Git リポジトリ設定から Webhook を追加します。

Webhook URL に上記 URL を設定してください。

## Bitrise 側の設定

Bitrise のプロジェクト設定 → Code → Incoming Webhooks で
「SETUP MANUALLY」から GitHub を選ぶと Webhook URL が表示されます。

    https://hooks.bitrise.io/h/github/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX/YYYYYYYYYYYY

この URL の `https://hooks.bitrise.io/h/github/` より後ろの部分が
`{bitrise_hook_path}` です。この値は Bitrise がプロジェクトごとに
払い出すトークンを含むため、第三者に公開しないでください。

例：

    XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX/YYYYYYYYYYYY

## 環境変数

SECRET\
Webhook
の認証用トークンです。推測されにくい長いランダム文字列を設定してください。

## 動作確認

まずダミーで叩いて Lambda が起動することを確認します。

    curl -i -X POST \
      -H "content-type: application/json" \
      -d '{}' \
      https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/default/backlog-git-webhook-to-bitrise/WRONG_SECRET/00000000-0000-0000-0000-000000000000/AAAAAAAAAA

次に SECRET と bitrise_hook_path を正しくして実行します。

    curl -i -X POST \
      -H "content-type: application/json" \
      -d '{}' \
      https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/default/backlog-git-webhook-to-bitrise/YOUR_SECRET/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX/YYYYYYYYYYYY

HTTP 200 が返り、Bitrise 側でビルドが開始されれば成功です。

## セキュリティ

-   URL に secret を含むため、第三者に漏れないようにしてください
-   CloudWatch Logs にコミット情報が出る場合があります
-   必要に応じてログ出力を制限してください

## ライセンス

MIT License
