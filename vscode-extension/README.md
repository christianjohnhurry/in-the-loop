# review-tui selection (VS Code extension)

Publishes the active file and selection to review-tui over a local, token-authenticated WebSocket. Protocol: [`docs/ide-protocol.md`](../docs/ide-protocol.md).

```sh
bun install
bun test
bun run package              # builds review-tui-selection-0.1.0.vsix
code --install-extension review-tui-selection-0.1.0.vsix
```

For development, open this folder in VS Code, run `bun run build`, and press F5 (Extension Development Host).
