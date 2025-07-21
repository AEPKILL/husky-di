# forwardRef 循环依赖

关于 “循环依赖”（Circular Dependency）以及如何通过“前向引用”（Forward Reference）来解决它。这是一个在设计依赖注入（DI）系统时非常经典且核心的问题。

## 1. 什么是循环依赖？

循环依赖，顾名思义，就是两个或多个服务（或类）相互依赖，形成一个闭环。

最简单的例子是 A 依赖 B，同时 B 又依赖 A。

**代码示例：**

```typescript
// AService.ts
import { BService } from "./BService";

export class AService {
  // A 的构造函数需要一个 BService 的实例
  constructor(private readonly bService: BService) {}

  doSomething() {
    console.log("AService is doing something.");
    this.bService.doSomethingElse();
  }
}

// BService.ts
import { AService } from "./AService";

export class BService {
  // B 的构造函数需要一个 AService 的实例
  constructor(private readonly aService: AService) {}

  doSomethingElse() {
    console.log("BService is doing something else.");
  }
}
```

## 2. 为什么循环依赖是个问题？

对于一个简单的 DI 容器来说，上述情况会导致程序崩溃。让我们模拟一下容器解析（Resolve）依赖的过程：

1. 你的代码请求容器提供一个 `AService` 的实例：`container.get(AService)`。
2. 容器发现要创建 `AService`，就去调用它的 `new AService(...)` 构造函数。
3. 容器看到 `AService` 的构造函数需要一个 `BService` 的实例。
4. 于是，容器暂停创建 `AService`，转而去创建 `BService` 的实例：`container.get(BService)`。
5. 容器发现要创建 `BService`，就去调用它的 `new BService(...)` 构造函数。
6. 容器看到 `BService` 的构造函数需要一个 `AService` 的实例。
7. 于是，容器暂停创建 `BService`，转而去创建 `AService` 的实例：`container.get(AService)`。

**我们回到了第一步。**

这个过程会无限重复下去，直到耗尽调用栈空间，导致一个“栈溢出”（Stack Overflow）错误。DI 容器无法在构造函数注入的模式下完成这个“先有鸡还是先有蛋”的悖论。

## 3. “前向引用” (Forward Reference) 如何解决问题？

“前向引用”是一种机制，它允许我们**延迟解析**一个依赖。

它的核心思想是：**“我现在告诉你我需要一个依赖，但你不用立即把它给我。你先记下来，等你把所有东西都准备好了，再回过头来真正地解析它。”**

这打破了在实例化过程中必须“立即”获得依赖实例的僵局。

### 实现机制

`forwardRef` 通常被实现为一个包装函数。它接受一个返回真正依赖类型的**惰性函数**（Lazy Function）作为参数。

**代码示例（概念性的）：**

```typescript
// 一个 forwardRef 的简单实现
function forwardRef(fn) {
  // 只是给这个函数打上一个标记，表明它是一个需要延迟解析的引用
  fn.__isForwardRef__ = true;
  return fn;
}
```

当 DI 容器在注册或解析依赖时，如果发现一个依赖被 `forwardRef` 包裹，它就不会立即执行那个惰性函数。相反，它会：

1. **注册阶段**：容器先扫描所有的服务定义。当遇到 `forwardRef(() => AService)` 时，它不会去执行 `() => AService`，而是把这个函数本身存起来，标记为“懒加载”。这样，即使 `AService` 此刻还未被完全定义（因为它的文件可能在后面才被加载），也不会导致引用错误（ReferenceError）。

2. **解析阶段**：当 `container.get(BService)` 被调用时，容器需要 `AService`。它发现 `AService` 的依赖是一个懒加载函数。此时，容器会这样做：
   - 它知道自己**正在创建 `BService` 的过程中**，并且这个过程是为了满足创建 `AService` 的前置条件。
   - 容器会创建一个 `AService` 的**代理对象（Proxy）** 或一个未完全初始化的实例。
   - 将这个代理对象注入到 `BService` 的构造函数中，从而成功创建 `BService` 的实例。
   - 现在 `BService` 的实例有了，容器就可以回过头来，用它完成 `AService` 的实例化。
   - 最后，`AService` 和 `BService` 的实例都创建完毕，并且它们各自持有了对方的有效实例。循环被打破了。

### 在 DI 框架中的应用

像 NestJS 和 Angular 这样的框架，已经内置了 `forwardRef` 功能。用法通常如下：

```typescript
import { Injectable, Inject, forwardRef } from "@nestjs/common"; // 以 NestJS 为例

@Injectable()
export class AService {
  constructor(
    // 告诉容器：BService 这个依赖暂时别解析，我给你一个“指针”
    @Inject(forwardRef(() => BService))
    private readonly bService: BService
  ) {}
}

@Injectable()
export class BService {
  constructor(
    // 通常只需要在循环的一方使用 forwardRef 即可，但两边都用更保险
    @Inject(forwardRef(() => AService))
    private readonly aService: AService
  ) {}
}
```

## 总结与权衡

| 特性           | 问题：直接循环依赖               | 解决方案：使用前向引用                     |
| :------------- | :------------------------------- | :----------------------------------------- |
| **解析时机**   | 立即解析，同步进行               | 延迟解析，异步或分阶段进行                 |
| **结果**       | 栈溢出，程序崩溃                 | 成功创建实例，程序正常运行                 |
| **耦合性**     | 极高的构造时耦合                 | 仍然是高耦合，但解除了构造时的死锁         |
| **代码可读性** | 表面上很直接，但隐藏了运行时错误 | 代码稍显复杂，需要理解 `forwardRef` 的概念 |

**重要建议：**

虽然 `forwardRef` 是一个解决循环依赖的强大工具，但**它也可能是一个“代码异味”（Code Smell）的信号**。

当你发现需要使用 `forwardRef` 时，最好先停下来思考一下：

> **AService 和 BService 的职责是否划分得足够清晰？它们是不是都承担了太多的功能，以至于产生了如此紧密的耦合？**

很多时候，循环依赖可以通过**重新设计**来避免。例如，可以引入第三个服务 C，将 A 和 B 共享的逻辑或数据抽取到 C 中，然后让 A 和 B 都依赖 C。这样，单向的依赖关系 `A -> C` 和 `B -> C` 就取代了双向的 `A <-> B`，代码会变得更清晰、更易于维护。

因此，把 `forwardRef` 当作解决技术难题的最后手段，而不是设计上的首选方案。
