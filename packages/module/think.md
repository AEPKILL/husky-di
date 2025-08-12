# Think

模块语法定义:

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
