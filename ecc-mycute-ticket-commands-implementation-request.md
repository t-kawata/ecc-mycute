# ecc-mycute チケット駆動コマンド実装依頼書

## 概要

ecc-mycute に、チケット駆動で Claude Code の作業を進めるための新しいコマンド群と、それを支える Node.js ベースの補助スクリプト群を追加したい。[page:1][page:2][page:3] 追加対象の中心は `/make-ticket`、`/plan-ticket`、`/start-ticket` の 3 コマンドであり、いずれも `ticket_id` を一級の識別子として扱う。[web:77][web:36]

この機能の目的は、チケット作成、要件深掘り、実装提案、承認後の実装開始までの流れを、Claude Code 上で安全かつ反復可能なワークフローとして定着させることにある。[page:2][page:3] 特に Zed 上での Claude Code 利用を前提に、引数入力 UX に依存しすぎず、必要時には AI 側が `ticket_id` を対話で確認できる設計とする。[web:84][web:91]

また、トークン消費を抑えるため、機械的な探索・採番・ファイル生成・状態更新は可能な限り Node.js スクリプトに寄せ、Claude には質問、要件整理、提案、承認判断補助など意味的処理を担当させる。[page:1][page:2][page:3]

## 背景

ecc-mycute はすでに `commands/`、`scripts/`、`tests/`、`skills/`、`hooks/` などを含む構成を持ち、ワークフロー系コマンドや補助機構を拡張できる余地がある。[page:1][page:2] `package.json` でもこれらのディレクトリが配布対象に含まれており、スラッシュコマンド単体ではなく、補助スクリプトを含めた機能追加が自然なリポジトリ構造になっている。[page:1]

また `CLAUDE.md` では、非自明な変更に対する plan 重視、日本語での説明、TDD、検証の明文化などが求められているため、本件も単なるコマンド追加ではなく、情報設計、状態管理、テスト設計まで含めて実装することが望ましい。[page:3]

## 実現したいワークフロー

### 1. `/make-ticket`

`/make-ticket` は新規チケット作成と既存チケット深掘りの両方を担うコマンドとする。[web:55][web:56] `ticket_id` が指定されていて、その ID が既存チケットとして見つかる場合は、既存の spec や補足情報を読み取り、不足情報を会話で埋めながらチケットの詳細を深めていく。[web:37][web:54]

一方、指定した `ticket_id` が存在しない場合は、その ID で新規チケットを作成するか確認し、必要な聞き取りを行ったうえで、チケット本体、詳細定義ファイル、補足資料ディレクトリ、必要に応じた draft ファイルを生成する。[web:37][web:54][web:56]

### 2. `/plan-ticket`

従来 `/next-ticket` と考えていた役割は `/plan-ticket` に変更する。[web:80][web:83] このコマンドは、指定された `ticket_id` のチケットを対象に、詳細定義ファイルを生成または更新し、実装作業の提案を行う。[web:36][web:54]

重要なのは、この段階では実装を開始しないことである。承認前のフェーズでは、対象ファイル候補、実装方針、懸念点、テスト観点、分割方針などを提案し、ユーザーとの数往復のレビューを経て合意形成を行う。[page:3][web:81]

### 3. `/start-ticket`

`/start-ticket` は、指定された `ticket_id` のチケットが承認済みであることを確認した上で、初めて実装を開始するコマンドとする。[web:78][web:81] 承認状態でない場合は、理由を明示して停止し、必要に応じて `/make-ticket` または `/plan-ticket` へ戻るよう案内する。[web:78][web:81]

このコマンドは、安全性の観点から「承認済みチェック」を厳格に行う必要がある。仕様が未確定のままコードを書き始めないことが重要である。[page:3]

## 必須要件

### ticket_id の導入

すべてのチケットは整数の `ticket_id` を持つ。[web:77][web:36] `ticket_id` は人間が指定可能であり、また必要に応じてシステムが空き番号を採番できるようにする。

以下を満たすこと。

- `ticket_id` は一意であること。
- `ticket_id` はファイル名、本文メタデータ、関連ディレクトリ名のすべてで参照可能にすること。
- タイトルや slug が変わっても `ticket_id` で安定して追跡できること。

### 引数があれば使い、なければ質問する

Zed 上ではスラッシュコマンドに対して引数を付ける UX が弱い、または利用しづらい可能性があるため、各コマンドは引数を**必須にしない**設計とする。[web:84][web:91]

以下を満たすこと。

- `/make-ticket 42` のように引数が与えられた場合はその `ticket_id` を使う。[web:83][web:59]
- `/make-ticket` のように引数がない場合は、AI 側が「対象の ticket_id を教えてください」と質問してから進行する。[web:60][web:59]
- `/plan-ticket`、`/start-ticket` も同じ UX を持つこと。
- 不正な入力であれば再確認すること。

### AI に毎回全ファイルを読ませない

`ticket_id` 確定後に、AI が Markdown ファイル群を総なめして対象チケットを探す構造は避けること。トークン消費を抑えるため、機械的な特定処理は Node.js スクリプトに寄せること。[page:1][page:2][page:3]

以下を満たすこと。

- `ticket_id` から対象 spec、context、status を解決するのは Node.js スクリプトで行う。
- queue 一覧の全読込を避け、必要な情報だけを JSON で返す。
- Claude は Node.js スクリプトが返した対象ファイルだけを読む。
- status 確認、存在確認、採番、queue 更新も原則スクリプトで処理する。

## 推奨ディレクトリ構造

以下のような構造を基本案とする。

```text
commands/
  make-ticket.md
  plan-ticket.md
  start-ticket.md

scripts/
  tickets/
    create-ticket.js
    resolve-ticket.js
    list-tickets.js
    update-ticket-status.js
    ensure-ticket-structure.js
  lib/
    tickets.js

tickets/
  queue.md
  specs/
    0001-example-ticket.md
  context/
    0001-example-ticket/
  drafts/
    0001-example-ticket.md

tests/
  tickets/
    resolve-ticket.test.js
    create-ticket.test.js
    update-ticket-status.test.js
    command-flows.test.js
```

この構造はあくまで基本案であり、既存リポジトリのテスト基盤や scripts 配置方針に合わせて微修正してよい。[page:1][page:2]

## データ設計

### 1. `tickets/queue.md`

人間可読の一覧として維持する。最低限、チェックボックス、`ticket_id`、タイトル、spec パスが見えること。

例:

```md
- [ ] #42 Search optimization | tickets/specs/0042-search-optimization.md
- [x] #41 Admin copy update | tickets/specs/0041-admin-copy-update.md
```

ただし、**正本は queue ではなく各 spec ファイルの metadata とする**方針を推奨する。queue は可視化・一覧性のための補助であり、状態の唯一の正本にしない。[page:3]

### 2. spec ファイル

`ticket_id`、title、slug、status、作成日、更新日を持つ metadata を先頭に置くこと。Node.js スクリプトが全文を解釈せずに状態判定できるよう、frontmatter あるいは先頭固定フォーマットを採用すること。

推奨例:

```md
---
ticket_id: 42
title: Search optimization
slug: search-optimization
status: draft
created_at: 2026-05-16
updated_at: 2026-05-16
---

# Summary

...
```

### 3. status の定義

少なくとも以下の状態を持つこと。

- `draft`
- `reviewing`
- `approved`
- `implementing`
- `done`
- 必要なら `blocked`

`/make-ticket` は主に `draft` または `reviewing` を扱い、`/plan-ticket` は `reviewing` への遷移を担当しうる。[page:3] `/start-ticket` は `approved` 以外では開始しないこと。

### 4. context ディレクトリ

各 ticket について `tickets/context/NNNN-slug/` を持てるようにする。ここには、補足メモ、関連資料、調査ログ、設計図、スクリーンショット説明、参考リンク整理などを格納する。

### 5. drafts ディレクトリ

`/make-ticket` の質問途中で中断しても再開しやすいように、正式 spec の前段として `drafts/` を持つ案を推奨する。[web:37][web:54] ただし、実装を簡素化したい初期フェーズでは drafts を省略し、spec を初期状態から育てる方針でもよい。

## Node.js スクリプト層の要件

### 基本方針

機械的で意味判断を必要としない処理は、可能な限り Node.js に寄せること。[page:1][page:2] Claude Code コマンドは、これらのスクリプトの結果を使って会話・提案・判断支援を行う。

### `scripts/lib/tickets.js`

共通ライブラリとして、最低限以下の責務を持たせること。

- `ticket_id` の妥当性チェック
- slug 生成
- file path 解決
- spec frontmatter 読み書き
- queue 行生成・更新
- チケット存在確認
- 次の空き `ticket_id` 採番
- 日付更新

### `scripts/tickets/resolve-ticket.js`

入力された `ticket_id` から、該当チケットの存在有無と、関連ファイルパス、status、title などの軽量情報を JSON で返す CLI とする。[page:2]

出力イメージ:

```json
{
  "exists": true,
  "ticketId": 42,
  "title": "Search optimization",
  "slug": "search-optimization",
  "status": "reviewing",
  "specPath": "tickets/specs/0042-search-optimization.md",
  "contextDir": "tickets/context/0042-search-optimization"
}
```

### `scripts/tickets/create-ticket.js`

新規チケットの作成を担当する。必要に応じて `ticket_id` を指定でき、未指定なら採番する。

要件:

- spec ファイル生成
- context ディレクトリ生成
- queue 追加
- 必要なら drafts 生成
- 重複 `ticket_id` の拒否
- 重複 slug への対処
- JSON で結果を返す

### `scripts/tickets/update-ticket-status.js`

status の更新を行う。`approved` から `implementing` への遷移、`implementing` から `done` への遷移などを扱う。

可能であれば、状態遷移ルールもこのスクリプト層で制限し、不正遷移を防ぐこと。

### `scripts/tickets/list-tickets.js`

人間向けではなくコマンド補助向けの軽量一覧を返す。将来的に `/list-tickets` のようなコマンドを追加する余地もあるため、疎結合に作ること。

### `scripts/tickets/ensure-ticket-structure.js`

初回利用時に `tickets/` 配下の標準構造を作るユーティリティがあると望ましい。存在しない場合のみ作成する idempotent な挙動とする。

## スラッシュコマンド仕様

### `/make-ticket`

#### 目的

チケットの新規作成、または既存チケットの詳細深掘りを行う。[web:37][web:54]

#### 基本フロー

1. 引数に `ticket_id` があればそれを候補とする。なければ質問する。[web:60][web:59]
2. Node.js スクリプトでその `ticket_id` が既存か確認する。
3. 既存なら、spec の軽量情報を取得し、必要なら spec 本文を読んで、不足情報を質問する。
4. 未存在なら、新規作成してよいか確認する。
5. 質問を数往復行い、目的・背景・スコープ・非スコープ・受け入れ条件・懸念点を整理する。
6. Node.js スクリプトで spec/context/queue を作成または更新する。
7. 最後に、整理結果の要約を返す。

#### 重要ルール

- 既存チケットのときは、上書きではなく深掘り更新を基本とする。
- 機械的なファイル生成はスクリプトで行う。
- タイトル変更や slug 変更があっても `ticket_id` は不変とする。
- 明らかに曖昧な要件は質問し、勝手に決め打ちしない。

### `/plan-ticket`

#### 目的

指定したチケットの仕様を読み、実装計画と実装提案を作る。[web:36][web:54]

#### 基本フロー

1. 引数または質問で `ticket_id` を確定する。[web:60]
2. Node.js スクリプトでチケットを解決する。
3. spec が不足していれば、まずその不足を指摘する。
4. 必要なら spec を更新し、status を `reviewing` に寄せる。
5. 実装対象候補、変更ファイル候補、分割方針、テスト観点、リスク、ロールバック観点を提案する。
6. ユーザーのコメントを受けて spec を更新する。
7. 明示承認が得られるまで実装に進まない。

#### 重要ルール

- このコマンドはコード変更を開始しない。
- 実装計画と合意形成が主目的である。
- spec 未成熟時は「実装提案」より先に「spec の不足解消」を優先する。

### `/start-ticket`

#### 目的

承認済みチケットのみを対象に実装を開始する。[web:78][web:81]

#### 基本フロー

1. 引数または質問で `ticket_id` を確定する。
2. Node.js スクリプトで対象チケットと status を取得する。
3. `approved` でない場合は停止し、必要に応じて `/plan-ticket` または `/make-ticket` に戻す。
4. `approved` の場合のみ spec を読んで実装を開始する。
5. 実装開始時に status を `implementing` に更新する。
6. 実装完了時に別途 `done` へ更新できるようにする。

#### 重要ルール

- 未承認では開始しない。
- 実装開始前に対象 spec のみ読む。
- tickets 全体の総読みを避ける。

## 会話 UX 要件

各コマンドは、引数あり・なしの両方に対応する。[web:83][web:60]

### 共通ルール

- 引数あり: 即座にその `ticket_id` を使う。
- 引数なし: `ticket_id` を質問する。
- ticket が存在しない場合の挙動はコマンドごとに異なる。
- 質問は端的に行う。
- 一度に質問しすぎず、必要最低限のラウンドで進める。

### Zed 向け配慮

Zed 上では引数入力 UX が弱いことを踏まえ、引数なし利用を第一級のケースとして扱うこと。[web:84][web:91] コマンドは「引数がなくても違和感なく進行できる」ことを重視する。

## トークン節約戦略

この実装の重要な目的の一つは、AI に不要なファイル探索をさせないことにある。[page:1][page:2][page:3]

徹底すべき戦略は以下の通り。

- ticket 特定は Node.js に任せる。
- 一覧取得は JSON の軽量出力にする。
- status 判定は frontmatter または固定ヘッダのみで済ませる。
- AI は該当 spec だけを読む。
- queue は人間向け表示とし、AI の探索起点にしない。
- slug 変更によって検索コストが増えないよう、ID ベース解決を徹底する。

## テスト要件

最低限、以下のケースを自動テスト対象とすること。[page:1][page:3]

### Node.js スクリプト単体

- `ticket_id` の正常解決
- 存在しない `ticket_id` の検出
- 重複作成拒否
- 空き `ticket_id` 採番
- slug 生成の安定性
- spec frontmatter の read/write
- status 更新の正常系
- status 不正遷移の拒否
- `ensure-ticket-structure` の idempotency

### コマンドフロー

- `/make-ticket` 新規作成フロー
- `/make-ticket` 既存深掘りフロー
- `/plan-ticket` 未存在 ID のエラー分岐
- `/plan-ticket` review 提案フロー
- `/start-ticket` 未承認ブロック
- `/start-ticket` 承認済み開始フロー
- 引数なし時の質問フロー
- 引数あり時の即時処理フロー

## 実装フェーズ提案

### Phase 1: 最小実装

まずは Markdown コマンド + Node.js スクリプト + 基本テストで動く最小構成を作る。[page:1][page:2] このフェーズでは、以下を優先する。

- `ticket_id` ベース解決
- spec / context / queue の生成
- 3 コマンドの基本フロー
- `approved` チェック
- Zed 向けの引数なし質問 UX

### Phase 2: 状態遷移の厳格化

次に、status 遷移の検証、不正更新のブロック、drafts の活用、補助ログ整備などを進める。

### Phase 3: 運用改善

必要に応じて以下を追加する。

- `/list-tickets`
- `/approve-ticket`
- 補助ログ生成
- hooks 連携
- 変更履歴追跡

## 非機能要件

- 既存 ecc-mycute のコーディング・テスト方針に従うこと。[page:3]
- できるだけ Surgical Diff に留めること。[page:3]
- 日本語での説明と運用ガイドが必要であること。[page:3]
- 失敗時のメッセージは簡潔かつ行動可能であること。
- 同じ入力に対してできるだけ安定した結果を返すこと。
- idempotent に実行可能な処理はそのように設計すること。

## 実装時の判断指針

以下の判断を優先すること。

1. トークン削減より安全性が上位。ただし安全性を損なわない範囲でトークンを削減する。
2. 人間可読性より ID ベースの機械安定性を優先する。
3. queue を唯一の正本にしない。
4. AI は意味判断、Node.js は機械処理、という分担を崩さない。
5. Zed での使い勝手を優先し、引数なしフローを正式サポートする。

## 受け入れ条件

本件は、少なくとも以下を満たしたときに受け入れ可能とみなす。

- `ticket_id` を軸としたチケット運用が成立していること。
- `/make-ticket` が新規作成と既存深掘りの両方に対応していること。
- `/plan-ticket` が承認前の実装提案に特化していること。
- `/start-ticket` が承認済みチケットのみ開始すること。
- 引数あり・なしの両方で動作すること。
- 引数なし時、AI が `ticket_id` を自然に質問できること。
- 機械的なチケット解決が Node.js スクリプト経由になっていること。
- AI が全 tickets を毎回読まない構造になっていること。
- 基本的な自動テストが通ること。
- ecc-mycute の既存方針と整合すること。[page:1][page:3]

## 補足提案

将来的には、`ticket_id` 指定なしの `/plan-ticket` に対して「未完了チケット一覧から選ぶ」補助や、`/approve-ticket` のような状態更新専用コマンドを追加してもよい。[web:83][web:78] ただし初期実装では責務を増やしすぎず、まずは 3 コマンド + Node.js 補助層を安定させることを優先する。[page:2][page:3]

## 最終依頼

ecc-mycute を開発している AI は、本依頼書に基づいて以下を実施すること。

- チケット情報設計の確定
- Node.js スクリプト層の設計・実装
- 3 つのスラッシュコマンドの追加
- 必要なテンプレート・補助ファイルの追加
- 自動テストの追加
- 最低限の利用ガイド整備

特に、Zed 利用時の UX、`ticket_id` の一級識別子化、Node.js による探索と状態更新の肩代わり、承認前実装の抑止、という 4 点を中核要求として扱うこと。[web:84][web:91][page:2][page:3]
