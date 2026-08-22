# 原型化流成员 Descriptor 与单 Peer facade Interface

Type: prototype
Status: open
Blocked by: 01, 02, 03
Parent: [为 Remote RPC 引入可恢复 Observable 流](../map.md)

## Question

用可编译 throwaway prototype 确定现有 opaque Remote Service Descriptor 与 IRpcPeer.resolve() 如何以最小 Interface 同时表达 unary 方法、直接返回 Observable 的方法和只读 Observable 属性。关闭 method/property allowlist 与 wire-name namespace、then 保留名、direct Observable 与拒绝的 Observable 参数/Promise-wrapped/nested/AsyncIterable 形态、ordinary args 与 AbortSignal、property readonly/$ suffix/getter/data-property 资格、Descriptor invariance、exposure implementation 映射、runtime interaction-kind metadata、facade member identity、frozen/null-prototype/non-thenable/可解构性质，以及 draining/closed/recovering 上的读取与 subscribe preflight。原型必须体现每次 subscribe 独立且 cold，不重新引入 Group facade，并以正反类型与最小 runtime probes 证明 Interface 深度。
