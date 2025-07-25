# 思考

<del>Module 是 Container 的蓝图，Container 是 Module 的实例。</del>

我对比了一下 InversifyJS 和 Angular 的 Module 机制，我发现二者更像是把 Module 当做一个批量注册服务的注册器，都仅仅执行了注册服务。

我觉得 Module 更应该类似与 Javascript 文件中的 Module 机制，他可以定义一些东西，可以有私有的服务，也可以导出一些服务。

Module 本身就是一个容器。

e.g:

```typescript
import { DatabaseService } from "@/services/database.service";
import { UserService } from "@/services/user.service";
import { AuthService } from "@/services/auth.service";

export const DatabaseModule = createModule({
  providers: [
    {
      serviceIdentifier: DatabaseService,
      useClass: DatabaseService,
    },
  ],
  exports: [DatabaseService],
});

const const UserModule = createModule({
  // 必须 imports DatabaseModule 才可以使用其中的服务
  imports: [DatabaseModule],
  providers: [
    {
      serviceIdentifier: UserService,
      useClass: UserService,
    },
  ],
});

const const AuthModule = createModule({
  imports: [
    UserModule.withAlias(UserService, User2Service),
    UserModule.withAlias(UserService, User3Service),
  ],
  providers: [
    {
      serviceIdentifier: AuthService,
      useClass: AuthService,
    },
  ],
});



```

这里需要明确的定义一下 Module 的定义：

1. Module 是一个独立的容器，他可以有私有的服务，也可以导出一些服务。
2. 如果导入的 Module 存在重复的服务，改如何解决？

   > 使用 Module.withAlias 来解决，使用 withAlias 创建一个中间的 Module 来解决。

```typescript
await AppModule.resolve(AppService).bootstrap();
```

```typescript
const AppModule = createModule({
  imports: [
    UserModule.withAlias(UserService, User2Service),
    UserModule.withAlias(UserService, User3Service),
  ],
  declarations: [
    {
      serviceIdentifier: AppService,
      useClass: AppService,
    },
  ],
  exports: [AppService],
});
```

```typescript
const DynamicModule = createDynamicModule({ name: "DynamicModule" });

DynamicModule.register({
  serviceIdentifier: AppService,
  useClass: AppService,
});

DynamicModule.register({
  serviceIdentifier: AppService,
  useClass: AppService,
});
```

要不然抛弃装饰器吧，因为装饰器对于类型的支持不友好。

dynamicModule 应该是可以完美替代 Container 的，除此之外我觉得还应该提供一个 RootModule，RootModule 也应该是一个 DynamicModule 可以注册一些全局性的东西。

但是层次化依赖注入该怎么搞？

```typescript
const DynamicModule = createDynamicModule({
  // 如果 parent 为空，则表示是根模块
  parent: RootModule,
  name: "DynamicModule",
});
```

2025-07-25:

我觉得还是应该职责分离:

- core 专注依赖注入的核心逻辑
- decorator 支持装饰器语法的依赖注入
- module 支持依赖注入模块化清晰架构
