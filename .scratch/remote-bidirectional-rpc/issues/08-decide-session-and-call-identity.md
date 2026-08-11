# 决定 Logical Session 与 call identity

Type: grilling
Status: open
Blocked by: 03, 07
Parent: [协议无关的双向 RPC](../map.md)

## 问题

哪些 identity 与 scope 可以让两个 peer 并发发起 call，并在 Physical Connection 重建后安全恢复 Logical Session？决定 peer、session、connection、operation 与 call identifier，origin disambiguation、uniqueness scope、reconnect attachment 与 fencing、state retention、late message rejection，以及断开的 session 从何时起不再允许 resume。
