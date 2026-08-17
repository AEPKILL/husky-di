# 决定规范验证与 package contract

Type: grilling
Status: open
Blocked by: 04, 06, 07, 08, 09, 10, 11, 12, 13, 14, 17
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

规范与 package contract 的 acceptance criteria 是什么？决定必须覆盖的 runtime `specification.test.ts` 场景、正负 type checks、默认 Protocol wire vectors、故障/Recovery probes、Transport Adapter conformance 和 Node/browser compatibility，以及 `@husky-di/remote` 的 exports、依赖、ESM/CJS/types、版本、文档、changeset 与独立 Adapter 包兼容性契约。本票只定义 verification/package acceptance contract；normative specification、requirement matrix 与 implementation route 由 `/to-spec` 产出。
