# review-tui selection (VS Code extension)

Publishes the active file and selection to review-tui over a local, token-authenticated WebSocket. Protocol: [`docs/ide-protocol.md`](../docs/ide-protocol.md).

To install a released build, download `review-tui-selection.vsix` from the [latest release](https://github.com/christianjohnhurry/in-the-loop/releases/latest) and run `code --install-extension review-tui-selection.vsix` (see the root README).

To build it yourself:

```sh
bun install
bun test
bun run package              # builds review-tui-selection.vsix (copies ../LICENSE in first)
code --install-extension review-tui-selection.vsix
```

For development, open this folder in VS Code, run `bun run build`, and press F5 (Extension Development Host).
