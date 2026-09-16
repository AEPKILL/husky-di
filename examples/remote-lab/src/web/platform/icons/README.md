# Material Icon Theme assets

These SVGs are a small vendored subset of
[Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)
by Material Extensions, under the [MIT license](LICENSE).
The upstream revision is
[`2ad292ecbdb54cc4d4901fa5a72091e90bc612ba`](https://github.com/material-extensions/vscode-material-icon-theme/tree/2ad292ecbdb54cc4d4901fa5a72091e90bc612ba).

`document.svg`, `folder-base.svg`, `javascript.svg`, `json.svg`, `markdown.svg`,
`test-ts.svg`, and `typescript.svg` are copied without modification from the
upstream [`icons/` directory](https://github.com/material-extensions/vscode-material-icon-theme/tree/2ad292ecbdb54cc4d4901fa5a72091e90bc612ba/icons).

`folder-base-open.svg` is generated from `folder-base.svg` by replacing the
`d` attribute of `#folder` with the upstream `OPEN_FOLDER_PATH`, as specified in
[`generateOpenFolderIcons.ts`](https://github.com/material-extensions/vscode-material-icon-theme/blob/2ad292ecbdb54cc4d4901fa5a72091e90bc612ba/src/scripts/svg/generateOpenFolderIcons.ts).
The remaining SVG content is preserved.

Remote Lab associates `.case.ts` files with the TypeScript test icon and bundles
these assets locally; displaying them requires no network request to upstream.
