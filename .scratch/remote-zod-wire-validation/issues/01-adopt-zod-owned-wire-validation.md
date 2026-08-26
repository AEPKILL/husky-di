# Adopt Zod-owned protocol validation

Type: task
Status: resolved
Parent: [`@husky-di/remote` Zod-owned protocol validation](../spec.md)

## Goal

实施父spec：让package-private Zod成为Default Protocol所有materialized data-shape validation与
对应private record types的单一executable source，删除整个published protocol data-asset surface，
并把其余runtime schemas深入owning Modules。

## Required change

- 为Default Protocol建立primitive、semantic-message与phase-entry Zod schemas。
- 保留bounded raw parser；Codec在parse后通过当前phase的schema取得validated output，并在owning seam
  投影Protocol errors/faults。
- 用`z.output`派生与record schemas一一对应的private record types，移除重复field declarations。
- 保持open tagged tails、closed error payload、Close forbidden-member rules与proof input preservation。
- 将`rpc-schema.util.ts`的其余schemas迁入各自owners，删除该catch-all Module。
- 将无复合字段grammar的primitive、built-in brand、safe-integer与plain-record checks集中为
  package-private native type guards。
- 删除整个`packages/remote/wire/`目录、所有`./wire/*` exports和package `files` entry。
- 把必要的raw parser、decoded-record、cryptography与recovery coverage迁入TypeScript runtime、
  resource与browser tests，不再验证独立data assets。
- 同步更新normative spec、requirements matrix、matching `specification.test.ts`和packed-consumer
  expectations。

## Scope guard

- 不改变wire bytes、Protocol state machine、limits、fault scope或public Protocol/Transport seams。
- 不公开Zod schema、default record types或validator。
- 不增加Validator abstraction、registry、adapter、JSON Schema generator或第二份grammar。
- Bounded raw parser、Application Value安全normalization、state/security semantics与resource admission
  继续由owning Modules负责，不伪装成Zod data-shape validation。
- `RpcApplicationValue`与Protocol SPI types不从Default Protocol record schemas派生。
- Outbound trusted records不重复执行完整inbound validation。

## Acceptance

- 父spec的全部acceptance criteria满足。
- 现有规范化错误文本断言继续通过，其他Zod failures不以`ZodError`越过Codec seam。
- `packages/remote/wire/`不存在；`package.json`不包含`./wire/*` export或`wire` files entry。
- 公开文档不再承诺或列出schema、vector、transcript或其他protocol data asset。
- `rg 'rpc-schema.util' packages/remote/src`无命中且文件已删除。
- `packages/remote` typecheck、runtime/specification/protocol/resource/package tests和browser tests通过。
- Repository code-standard verification通过；生产代码变更遵循`husky-di-code-standard`。

## Comments

## Answer

- Default Protocol decoded records now use package-private, phase-specific Zod schemas; matching private record
  types derive from schema output through a bounded readonly wrapper.
- Runtime validation schemas now live with their owning Modules. The former catch-all `rpc-schema.util.ts` is
  deleted, genuinely shared Base64Url32 and wire-identifier invariants each have one focused private schema, and
  repeated primitive JavaScript brand checks share one package-private type-guard utility.
- The published `wire/` directory, four `./wire/*` exports, JSON schema, vectors, transcripts, and cross-language
  publication contract are removed. Equivalent parser, grammar, cryptography, recovery, package, and browser
  evidence now runs directly as TypeScript tests.
- Normative specification, requirement matrix, specification coverage, README, Protocol guide, CHANGELOG, and
  packed-consumer expectations are synchronized.
- Final verification passed: build, TypeScript, Biome, code-standard, 343 Node tests, and Chromium/Firefox/WebKit.
