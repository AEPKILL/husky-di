# 决定 transport adapter seam

Type: prototype
Status: open
Blocked by: 01, 02
Parent: [协议无关的双向 RPC](../map.md)

## 问题

以“验证面向用户的 RPC 接口”选定的显式 Connector Adapter、Acceptor Adapter 与 Physical Connection public shape，以及跨运行时 transport 研究为输入，锁定其完整 behavioral contract：所选传输单位如何映射 message transport 与 raw-byte transport、framing 与 codec 的准确 ownership、adapter 保证哪些 ordering / local admission / delivery 事实、正常 end 与 failure 的竞态、buffer bounds，以及 in-memory adapter 的 conformance tests。不得把已由前置原型选定的 adapter-author public interface 再次留空或换成 type hole。
