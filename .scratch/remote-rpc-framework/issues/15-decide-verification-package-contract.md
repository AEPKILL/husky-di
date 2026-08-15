# 决定规范验证与 package contract

Type: grilling
Status: open
Blocked by: 04, 06, 07, 08, 09, 10, 11, 12, 13, 14, 17
Parent: [协议可替换的双向 RPC 框架](../map.md)

## Question

哪些 normative requirements、runtime `specification.test.ts` 场景、正负 type checks、默认 Protocol wire vectors、故障/Recovery probes、Transport Adapter conformance tests 和 Node/browser compatibility checks 才足以锁定公开行为？同时决定 `@husky-di/remote` 的 exports、依赖、ESM/CJS/types contract、版本策略、文档与 changeset gate，以及独立 Adapter 包如何声明兼容的 core/Protocol 版本。
