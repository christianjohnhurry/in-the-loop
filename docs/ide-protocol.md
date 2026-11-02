# IDE selection protocol

How the VS Code extension (`vscode-extension/`) tells a client such as review-tui which file and lines the reviewer is looking at. SWE-6 implements the client side.

## Discovery

On activation the extension starts a WebSocket server on `127.0.0.1` (random port) and writes `~/.review-tui/ide/<port>.lock` (directory `0700`, file `0600`). Override the directory with `REVIEW_TUI_IDE_DIR`. The file is removed on deactivate and on process exit.

```json
{
  "port": 43127,
  "pid": 81234,
  "authToken": "<64 hex chars>",
  "ideName": "Visual Studio Code",
  "workspaceFolders": ["/home/me/code/in-the-loop"],
  "transport": "ws"
}
```

A crash can leave a stale lock behind. Clients should skip locks whose `pid` is not running or whose port refuses connections. To pick among several, choose the lock whose `workspaceFolders` contains (or equals) the repo checkout.

## Connecting

Connect to `ws://127.0.0.1:<port>` with the header `x-review-tui-auth: <authToken>`. Connections without a matching token, or carrying an `Origin` header (i.e. from a browser), are refused at the handshake with HTTP 401. Communication is one-way: the server sends, clients only listen.

## Messages

JSON text frames. Lines are **1-based and inclusive**. On connect the server immediately sends the latest message of each type; after that it sends one whenever things change (debounced ~100 ms).

### `active_file`

```json
{"type": "active_file", "path": "src/llm.ts"}
```

`path` is relative to the workspace folder containing the file, with `/` separators. It is `null` when no editor is active or the document is not a file in a workspace folder. Sent only when the path changes, even with nothing selected.

### `selection`

```json
{
  "type": "selection",
  "path": "src/llm.ts",
  "selection": {"startLine": 42, "endLine": 48, "text": "..."}
}
```

`selection` is `null` when nothing is highlighted (a bare cursor). A selection ending at column 0 of a later line (as when selecting whole lines) does not count that last line. Sent on every selection change in the active editor, and when the active editor changes.

Paths are relative to the workspace folder, which may not be the repo root; match them against `workspaceFolders` when that matters.
