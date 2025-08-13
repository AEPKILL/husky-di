# Think

## 模块语法定义

### 当前语法设计

```js
const AppModule = createModule({
  imports: [
    UserModule,
    DatabaseModule.config({
      type: "mysql",
      host: "localhost",
      port: 3306,
      username: "root",
      password: "123456",
    }),
    AuthModule,
    {
      module: AuthModule,
      alias: {},
    },
  ],
  declarations: [
    {
      serviceIdentifier: "UserService",
      useClass: UserService,
    },
  ],
});

const app = createApplication(AppModule).resolve(IAppService);
app.bootstrap();
```

## 改进建议总结

### 🔥 高优先级改进

1. **API 命名统一**: `config` → `withConfig`
2. **完善 exports 定义**: 明确模块导出接口
3. **优化别名语法**: 使用更清晰的数组结构
4. **配置验证**: 集成运行时验证和类型安全

### ⚡ 核心扩展功能

1. **生命周期管理**: 添加 `onInit`, `onBootstrap`, `onDestroy` 钩子
2. **模块中间件**: 支持模块级别的中间件系统
3. **错误恢复**: 重试机制和降级策略
4. **性能监控**: 服务解析时间和内存监控

### 💡 高级特性

1. **依赖图可视化**: Mermaid 图表生成
2. **异步模块加载**: 懒加载和条件加载
3. **热重载**: 开发环境模块热更新
4. **微服务支持**: 远程模块和服务代理

### 推荐的改进语法

```typescript
const DatabaseModule = {
  withConfig(config: DatabaseConfig) {
    // 配置验证
    const validatedConfig = DatabaseConfigSchema.parse(config);

    return createModule({
      name: "DatabaseModule",
      declarations: [
        { serviceIdentifier: DatabaseConfig, useValue: validatedConfig },
        { serviceIdentifier: "DatabaseService", useClass: DatabaseService },
      ],
      exports: [DatabaseConfig, "DatabaseService"], // 明确导出
    });
  },
};

const AppModule = createModule({
  name: "AppModule",
  imports: [
    UserModule,
    DatabaseModule.withConfig({
      type: "mysql",
      host: "localhost",
      port: 3306,
      username: "root",
      password: "123456",
    }),
    AuthModule,
    {
      module: AuthModule,
      aliases: [
        // 更清晰的别名语法
        {
          serviceIdentifier: "AuthService",
          as: "PrimaryAuthService",
        },
      ],
    },
  ],
  declarations: [
    {
      serviceIdentifier: "AppService",
      useClass: AppService,
    },
  ],
  exports: ["AppService"],

  // 生命周期支持
  lifecycle: {
    async onInit(container) {
      console.log("AppModule initializing...");
    },
    async onBootstrap(container) {
      const logger = container.resolve("Logger");
      logger.info("Application started");
    },
  },
});

// 更清晰的启动语法
const container = createApplication(AppModule);
const app = container.resolve("AppService");
app.bootstrap();
```

详细设计方案请参考 [ROADMAP.md](./ROADMAP.md)
