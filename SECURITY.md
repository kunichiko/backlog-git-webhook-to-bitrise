# Security Policy

このプロジェクトは Backlog Git Webhook を受信し、Bitrise
のビルドをトリガーするための AWS Lambda プロキシです。

## Webhook Secret

API URL には secret が含まれています。

例:

https://xxxxx.execute-api.ap-northeast-1.amazonaws.com/default/backlog-to-bitrise-proxy/{secret}/{proxy}

secret には推測されにくい十分に長いランダム文字列を設定してください。

例:

c0f2f8c8e0f949c3b61c0f9b4d4a9c20

## Bitrise Webhook URL

Bitrise の Webhook URL は次の形式です。

https://hooks.bitrise.io/h/github/xxxxx/yyyyy

この URL の後半部分（xxxxx/yyyyy）は build
をトリガーできるトークンを含むため、第三者に公開しないよう注意してください。

## 推奨されるセキュリティ対策

本ツールを公開環境で利用する場合、次の対策を推奨します。

-   secret を十分に長いランダム文字列にする
-   CloudWatch Logs を監視する
-   不審なアクセスがあれば Webhook URL を変更する
-   必要に応じて AWS WAF を使用する
-   API Gateway にレート制限を設定する

## ログについて

デバッグ用ログには次の情報が含まれる可能性があります。

-   commit message
-   repository name
-   file paths

公開環境ではログ出力を最小限にすることを推奨します。

## 脆弱性の報告

セキュリティ上の問題を発見した場合は、公開 issue
を作成する前にリポジトリ管理者へ連絡してください。
