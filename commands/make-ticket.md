---
description: チケットを作成する。引数なしなら詳細をヒアリングしてAIがタイトルを決定、数字なら深掘り、数字以外ならそのままタイトルとして作成。
---

# /make-ticket

**役割**: チケットの作成と詳細化。

## 引数の解釈

- 引数なし → 実装したい内容を詳しくユーザーにヒアリングし、それに基づいてAIが適切なタイトルを決定する
- 数字 → 既存チケットIDとして深掘り
- 数字以外 → 新規チケットのタイトルとして作成

## Boy Scout Rule

新規作成時、spec の「Boy Scout Rule — 翻訳可能性計画」セクションに以下を必ず含める：関数名は動詞句、変数名はドメイン概念、一関数一責務、ハードコード値は名前付き定数、エラー握りつぶし禁止。**スコープ内外問わず、翻訳可能性を損なう既存コードを積極的に改善する計画を記載する。**

## 使用スクリプト一覧

`$_R/scripts/tickets/` 配下。`$_R` は `ECC_MYCUTE_PLUGIN_ROOT.md` から読み取る（初回は Step 0 で自動生成）。全スクリプトの詳細は `scripts/tickets/README.md` を参照。

| スクリプト | 引数 |
|---|---|
| `create-ticket.js` | `"" <title>` |
| `resolve-ticket.js` | `<id>` |
| `read-frontmatter.js` | `<id>` |
| `update-frontmatter.js` | `<id> <key> <val>` |
| `list-tickets.js` | `[status]` |
| `count-tickets.js` | （なし） |

## ワークフロー

### 初期化

```bash
if [ ! -f ECC_MYCUTE_PLUGIN_ROOT.md ]; then
  _R="$(node -e "process.stdout.write(process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude','plugins','marketplaces','ecc-mycute-marketplace'))")"
  echo "$_R" > ECC_MYCUTE_PLUGIN_ROOT.md
fi
```

### 新規作成

$ARGUMENTS が空なら、何を実装したいのか詳しくユーザーにヒアリングする（目的、背景、期待する動作など）。得られた情報をもとにAIが適切なタイトルを決めてから実行する。

```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/create-ticket.js" "" "タイトル"
```

出力の `ticketId`, `specPath` を保持し、Background / Scope / Acceptance Criteria をユーザーと対話して具体化する。

### 深掘り

```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/resolve-ticket.js" "42"
```

`exists: false` なら終了。存在すれば `read-frontmatter.js` で内容を取得し、不足セクションを補完する。

```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-frontmatter.js" "42"
```
