# Adopt Zod-owned wire validation

Type: task
Status: ready-for-agent
Parent: [`@husky-di/remote` Zod-owned wire validation](../spec.md)

## Goal

实施父spec：让package-private Zod成为Default Protocol executable decoded-tree grammar与对应private
wire types的单一来源，删除published JSON Schema contract，并把其余runtime validation深入owning Modules。

## Required change

- 为Default Protocol建立primitive、semantic-message与phase-entry Zod schemas。
- 保留bounded raw parser；Codec在parse后通过当前phase的schema取得validated output，并在owning seam
  投影Protocol errors/faults。
- 用`z.output`派生与record schemas一一对应的private wire types，移除重复field declarations。
- 保持open tagged tails、closed error payload、Close forbidden-member rules与proof input preservation。
- 将`rpc-schema.util.ts`的非wire schemas迁入各自owners，删除该catch-all Module。
- 删除`wire/husky-di-rpc-1/schema.json`和`./wire/husky-di-rpc-1/schema` export；保留vectors、
  transcripts与security-vectors的封闭exports。
- 同步更新normative spec、requirements matrix、matching `specification.test.ts`、wire corpus tests和
  packed-consumer expectations。

## Scope guard

- 不改变wire bytes、Protocol state machine、limits、fault scope或public Protocol/Transport seams。
- 不公开Zod schema、default wire types或validator。
- 不增加Validator abstraction、registry、adapter、JSON Schema generator或第二份grammar。
- `RpcApplicationValue`与Protocol SPI types不从Default Protocol schemas派生。
- Outbound trusted records不重复执行完整inbound validation。

## Acceptance

- 父spec的全部acceptance criteria满足。
- 现有规范化错误文本断言继续通过，其他Zod failures不以`ZodError`越过Codec seam。
- `rg 'schema.json|husky-di-rpc-1/schema' packages/remote`不再命中发布契约或实现引用。
- `rg 'rpc-schema.util' packages/remote/src`无命中且文件已删除。
- `packages/remote` typecheck、runtime/specification/wire/resource/package tests和browser tests通过。
- Repository code-standard verification通过；生产代码变更遵循`husky-di-code-standard`。

## Comments
