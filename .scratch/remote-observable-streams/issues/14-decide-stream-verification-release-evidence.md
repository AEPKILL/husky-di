# 决定流支持的规范验证、wire corpus 与发布证据

Type: grilling
Status: open
Blocked by: 03, 10, 11, 12, 13
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

确定本次 normative specification 改写需要的稳定 requirement/case IDs、requirement-to-evidence matrix 与 release gate。覆盖 Descriptor/facade/exposure type/runtime fixtures、source lifecycle、同步 burst、credit exhaustion、item/terminal duplicate与错序、Recovery replay、资源边界、公平性、shutdown、custom Protocol conformance、Adapter load seam、browser、packed ESM/CJS/types consumers，以及 husky-di-rpc/1 schema/raw vectors/stateful transcripts/security vectors 的整体替换。同步界定 README/PROTOCOL/TRANSPORT/architecture/CHANGELOG/examples 和 resolveAll removal migration evidence，确保不重编号或复用既有 requirement identity，也不把 implementation file layout 当作规范决定。
