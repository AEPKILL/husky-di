# `@husky-di/remote` Zod-owned protocol validation

Status: accepted
Scope: `packages/remote`

## Outcome

Default Protocol 用package-private Zod schemas作为所有materialized data-shape validation的唯一
executable source，并用`z.output<typeof schema>`派生与decoded-record schemas一一对应的private
record types。Package不发布default Protocol schema、record type、validator或data corpus。

“所有materialized data-shape validation归Zod”不等于所有trust-boundary decision都交给Zod。
Raw-byte grammar在ordinary object materialization前处理会丢失的lexical facts；Application Value
normalization必须安全遍历未信任的caller object；Protocol state transition、cryptographic proof、
resource admission与cross-field decisions依赖retained/runtime facts。这些继续由各自的owning Module
负责，不重建第二份data-shape grammar。无record/tuple/tagged-union字段grammar的primitive、built-in
brand、safe-integer与plain-record predicates可以由聚焦的package-private native type guards共享。

`@husky-di/remote`当前版本为`0.0.0`且尚无公开版本，因此当前package内容不构成已发布的兼容性承诺。

## Validation seams

| Seam | Owning Module | 必须校验的内容 | 主要证据 |
| --- | --- | --- | --- |
| Raw Transport message | Default Protocol Codec的bounded parser | `1 MiB`上限、strict UTF-8、BOM、JSON lexical grammar、duplicate keys、trailing data、paired surrogates、number spelling/domain，以及depth/node/member/element/string limits | Codec、Protocol与resource boundary tests |
| Decoded Protocol record | Default Protocol Record Grammar（Zod） | phase-specific tagged unions、required/optional members、literal/enum、safe integer、identifier、Base64Url32、Call Ordinal、known field domains，以及open/closed tail policy | Codec/Protocol validation tests |
| Application Value | Application Value Module | plain detached data tree、dense arrays、finite number、getter/`toJSON`/coercion prohibition、cycle与weight limits | value/resource tests |
| Stateful/security semantics | Protocol、Session、Call State与Cryptography Modules | phase transition、selected profile、proof、binding epoch、sequence/ACK/call ordinal continuity、replay、fault scope和capacity disposition | Protocol、security与browser tests |
| Caller/runtime inputs | 接收该input的factory或runtime Module | option bag、descriptor、policy、behavior object与cross-field invariant | owner-level runtime/specification tests |

Zod看不到原始bytes中已在materialization时丢失的信息，因此不能替代bounded parser。Zod也不拥有
Session或Call State，不能替代依赖retained facts的semantic validation。

## Protocol Record Grammar Module

- Record Grammar是Default Protocol内部的一个深Module。Codec只通过phase选择对应schema并取得validated
  record；其他Modules消费派生后的types，不重新组合schema。
- Grammar包含可复用的primitive schemas和四组phase entry schemas：`bootstrapRequest`、
  `freshAccept`、`resumeOutcome`与`active`。Nested `SemanticMessage`使用tagged union。
- Top-level records与nested tagged `SemanticMessage`保留validated unknown tail；proof verification前不得
  strip参与JCS input的unknown top-level members。Nested untagged Protocol objects（例如error payload）
  保持closed。`close`的known forbidden members用Zod refinement表达。
- Grammar负责decoded-tree的结构与局部值域；Protocol retained state参与的比较仍由owner在schema成功后执行。
- Codec不得向caller泄漏`ZodError`。它在owning seam投影稳定的Protocol error/fault；已有normative行为、
  fault scope和有意断言的错误文本保持不变。
- `encode()`接受Default Protocol内部构造的derived record types，只保留serialization与message-size检查；
  不为trusted internal record重复执行完整inbound parse。

## Type ownership

- 与Zod record shape一一对应的`RpcFreshRequest`、`RpcResumeRequest`、`RpcFreshAccept`、
  `RpcResumeOutcome`、`RpcSemanticMessage`、`RpcActiveRecord`等types由schema output派生。
- 可以保留type-only facade以稳定private import locality，但其中不得再次手写字段列表。
- 需要readonly或semantic brand时可以在derived output外加type-only wrapper，但不得复制record fields。
- `RpcApplicationValue`、Protocol SPI和caller-facing domain types不是Default Protocol tree grammar的
  镜像，继续由其owning Interface定义。
- Zod及所有default record schemas/types保持package-private，不加入root、`/protocol`、`/transport`或
  `/conformance` Interface。

## Runtime validation locality

当前catch-all `rpc-schema.util.ts`不再作为跨Module schema catalog。实施时把schemas移到拥有相应
invariant的Module：record grammar归Default Protocol，runtime policy归policy Module，Protocol behavior
objects归Protocol runtime Module，descriptor/exposure/reconnection validation归各自owner。

只有多个owners必须共享**同一个domain invariant**时才保留聚焦的package-private primitive；不能以
“可能复用”为理由重建通用validation Module。完成后删除`rpc-schema.util.ts`，不新增Validator
Interface、class、adapter或registry。无复合grammar ownership的primitive JavaScript brand checks可以
集中在聚焦的package-private type-guard util中。

## Published contract

首版的published package contract包含：

- caller、Protocol、Transport与conformance code entry points；
- normative prose；
- Protocol与Transport conformance runners。

首版不包含任何default Protocol data artifact：

- 不包含`packages/remote/wire/`目录；
- 不包含`./wire/*` package export；
- 不包含JSON Schema、raw vectors、security vectors或stateful transcripts；
- 不公开Zod schemas、default record types或validator entry。

## Implementation route

1. 先补characterization coverage，锁住phase分支、open/closed tails、reserved `then`、Call Ordinal、
   Base64Url32、safe integers、Application Value normalization、fault projection及raw parser limits。
2. 建立package-private Zod Record Grammar和phase entry schemas，让Codec通过它解析decoded tree。
3. 用`z.output`替换重复的hand-written record shapes，并保持private import direction。
4. 将其余runtime schemas深入owning Modules，删除catch-all `rpc-schema.util.ts`。
5. 删除整个`packages/remote/wire/`目录、所有`./wire/*` exports和package `files` entry；把必要的raw
   parser、decoded-record、cryptography与recovery coverage迁入TypeScript tests。
6. 在同一change中更新`SPECIFICATION.md`、`REQUIREMENTS.md`和匹配的`specification.test.ts` coverage，
   让`RPC-PKG-004`、`RPC-CORPUS-001`与`RPC-CORPUS-002`约束private runtime validation和release
   evidence，不再要求published data assets。
7. 运行package typecheck、runtime/specification/protocol/resource/package tests、browser matrix和repository
   code-standard verification。

## Acceptance criteria

- Repo中不存在`packages/remote/wire/`目录、`./wire/*` export、package expectation或normative
  publication要求。
- Decoded-tree record shape只有一份手写的executable Zod grammar；对应private types全部从schema output派生。
- 除raw-byte、Application Value安全normalization和retained-fact decisions以外，所有materialized
  data-shape validation都通过owning Module的Zod schema完成。
- Bounded parser、Application Value normalization及state/security validation没有被Zod替代或削弱。
- Open-tail、closed nested object、proof input preservation和fault scope与normative prose一致。
- 所有schema位于owning Module或一个有真实多caller leverage的聚焦primitive中；
  `rpc-schema.util.ts`被删除。
- 无复合字段grammar的primitive、built-in brand、safe-integer与plain-record checks通过聚焦的
  package-private native type guards复用。
- Public Interface不新增schema、validator、default record type或Zod leakage。
- Raw parser、record grammar、cryptography与recovery行为通过Node和browser runtime tests验证，不发布
  独立data assets。
- Normative specification、requirements matrix、matching `specification.test.ts`和packed consumer evidence与
  package exports一致，所有相关tests无skip通过。

## Out of scope

- 改变`husky-di-rpc/1`的wire bytes、record kinds、field semantics、resource limits或state machines。
- 把custom Protocol的grammar强制改成Zod。
- 新增validation framework、code generation pipeline或build-time schema artifact。
