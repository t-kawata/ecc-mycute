---
paths:
  - "**/*.rs"
---
# Rust Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md) with Rust-specific content.

## Formatting

- **rustfmt** for enforcement — always run `cargo fmt` before committing
- **clippy** for lints — `cargo clippy -- -D warnings` (treat warnings as errors)
- 4-space indent (rustfmt default)
- Max line width: 100 characters (rustfmt default)

## Immutability

Rust variables are immutable by default — embrace this:

- Use `let` by default; only use `let mut` when mutation is required
- Prefer returning new values over mutating in place
- Use `Cow<'_, T>` when a function may or may not need to allocate

```rust
use std::borrow::Cow;

// GOOD — immutable by default, new value returned
fn normalize(input: &str) -> Cow<'_, str> {
    if input.contains(' ') {
        Cow::Owned(input.replace(' ', "_"))
    } else {
        Cow::Borrowed(input)
    }
}

// BAD — unnecessary mutation
fn normalize_bad(input: &mut String) {
    *input = input.replace(' ', "_");
}
```

## Naming

Follow standard Rust conventions:
- `snake_case` for functions, methods, variables, modules, crates
- `PascalCase` (UpperCamelCase) for types, traits, enums, type parameters
- `SCREAMING_SNAKE_CASE` for constants and statics
- Lifetimes: short lowercase (`'a`, `'de`) — descriptive names for complex cases (`'input`)

## Ownership and Borrowing

- Borrow (`&T`) by default; take ownership only when you need to store or consume
- Never clone to satisfy the borrow checker without understanding the root cause
- Accept `&str` over `String`, `&[T]` over `Vec<T>` in function parameters
- Use `impl Into<String>` for constructors that need to own a `String`

```rust
// GOOD — borrows when ownership isn't needed
fn word_count(text: &str) -> usize {
    text.split_whitespace().count()
}

// GOOD — takes ownership in constructor via Into
fn new(name: impl Into<String>) -> Self {
    Self { name: name.into() }
}

// BAD — takes String when &str suffices
fn word_count_bad(text: String) -> usize {
    text.split_whitespace().count()
}
```

## Error Handling

- Use `Result<T, E>` and `?` for propagation — never `unwrap()` in production code
- **Libraries**: define typed errors with `thiserror`
- **Applications**: use `anyhow` for flexible error context
- Add context with `.with_context(|| format!("failed to ..."))?`
- Reserve `unwrap()` / `expect()` for tests and truly unreachable states

```rust
// GOOD — library error with thiserror
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("failed to read config: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid config format: {0}")]
    Parse(String),
}

// GOOD — application error with anyhow
use anyhow::Context;

fn load_config(path: &str) -> anyhow::Result<Config> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {path}"))?;
    toml::from_str(&content)
        .with_context(|| format!("failed to parse {path}"))
}
```

## Iterators Over Loops

Prefer iterator chains for transformations; use loops for complex control flow:

```rust
// GOOD — declarative and composable
let active_emails: Vec<&str> = users.iter()
    .filter(|u| u.is_active)
    .map(|u| u.email.as_str())
    .collect();

// GOOD — loop for complex logic with early returns
for user in &users {
    if let Some(verified) = verify_email(&user.email)? {
        send_welcome(&verified)?;
    }
}
```

## Module Organization

Organize by domain, not by type:

```text
src/
├── main.rs
├── lib.rs
├── auth/           # Domain module
│   ├── mod.rs
│   ├── token.rs
│   └── middleware.rs
├── orders/         # Domain module
│   ├── mod.rs
│   ├── model.rs
│   └── service.rs
└── db/             # Infrastructure
    ├── mod.rs
    └── pool.rs
```

## Visibility

- Default to private; use `pub(crate)` for internal sharing
- Only mark `pub` what is part of the crate's public API
- Re-export public API from `lib.rs`

## MYCUTE-Specific Prohibitions

### Result 伝播の徹底（防弾設計）
- すべての `main` 関数およびエントリポイントは `Result` を返し、エラーを最上位で集中管理する
- `unwrap()` / `expect()` を実務コードで使用してはならない（テストコードと静的に到達不能な箇所のみ許可）
- 正規表現は `Regex::new(...).unwrap()` ではなく `Lazy<Result<Regex, Error>>` パターンで安全に初期化する

```rust
use once_cell::sync::Lazy;
use regex::Regex;

static RE: Lazy<Result<Regex, regex::Error>> = Lazy::new(|| Regex::new(r"^\d+$"));

// Usage
if let Ok(ref re) = *RE {
    if re.is_match(input) {
        // ...
    }
}
```

### 単一メソッドチェーンの不必要な改行禁止
メソッドチェーンが1つのみ（例：`.map_err()` のみ）の場合、構造のシンプルさを優先し必ず1行で記述する。

```rust
// NG: 1つのメソッドチェーンなのに改行
std::fs::write(&path, &data)
    .map_err(|e| Error::Io(e.to_string()))?;

// OK: 1行で記述
std::fs::write(&path, &data).map_err(|e| Error::Io(e.to_string()))?;
```

メソッドチェーンが2つ以上繋がる場合は各ドットで改行して複数行に分けることを推奨。

### 曖昧な型と catch-all (_) による処理の禁止
`String` 等の広すぎる型で分岐し `_`（catch-all）で一括処理してはならない。必ず `enum` を定義し全ケースを網羅すること。

### 完全修飾名によるインポートの省略禁止
`crate::path::to::Type` をコード中に直接書かない。必ずファイル冒頭で `use` する。

### 関数内での `use` 文の使用禁止
`use` 文は原則としてファイルのトップレベルに記述する。関数内部での `use` は、名前の衝突回避など明確な意図がある場合のみ許可。

### 環境変数は `main_of_rt.rs` で一元管理

環境変数の直接参照（`std::env::var`）は `main_of_rt.rs` の起動時設定ブロックのみで行う。BL/Handler 層での環境変数直接呼び出しは禁止：

- 新しい設定項目は設定用構造体（`Config`）にフィールドを追加
- `main_of_rt.rs` の環境変数収集ブロックで読み込み
- 設定値は `Arc<Config>` 等の引数で各コンポーネントに伝搬

## References

See skill: `rust-patterns` for comprehensive Rust idioms and patterns.
