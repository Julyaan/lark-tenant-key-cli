# lark-tenant-key-cli

[English](README.md)

一个非官方、最小权限的命令行工具，用于获取当前授权飞书/Lark 用户所在企业的
`tenant_key`。应用配置、OAuth、Token 保存与刷新、OpenAPI 请求全部委托给官方
[`@larksuite/cli`](https://www.npmjs.com/package/@larksuite/cli)。

> 本项目与 Lark Technologies 无隶属或背书关系。Lark、飞书及相关标识归其各自权利人所有。

## 快速开始

需要 Node.js 22 或更高版本。

安装时（或首次执行时）还会下载官方预编译的 `lark-cli` 二进制文件，因此机器需要能访问
GitHub Releases 或已配置的 npm 二进制镜像。

飞书首次运行用一条命令完成 lark-cli 配置、用户授权和 tenant_key 获取：

```bash
npx --yes lark-tenant-key-cli --setup --brand feishu
```

国际版 Lark 使用：

```bash
npx --yes lark-tenant-key-cli --setup --brand lark
```

`--setup` 会通过官方 CLI 创建开放平台应用，执行人需要有创建/管理开发者应用的权限。客户没有
权限时，请让其应用管理员执行首次配置，或提供已经配置好的 lark-cli profile。

后续运行会复用 lark-cli 保存在本机的 profile 与 Token：

```bash
npx --yes lark-tenant-key-cli
```

经常使用时可全局安装：

```bash
npm install --global lark-tenant-key-cli
lark-tenant-key --setup --brand feishu
```

标准输出只包含最终 tenant_key，因此可安全用于命令替换：

```bash
export LARK_TENANT_KEY="$(lark-tenant-key)"
```

进度、浏览器授权提示和错误全部写入标准错误。

## 工作原理

1. 优先复用已有 lark-cli 用户登录态。
2. 缺少授权或 Token 失效时执行：

   ```bash
   lark-cli auth login --scope offline_access
   ```

3. 通过 lark-cli 调用只读用户信息接口：

   ```bash
   lark-cli api GET /open-apis/authen/v1/user_info \
     --as user \
     --jq '.data.tenant_key'
   ```

飞书[用户信息接口](https://open.feishu.cn/document/server-docs/authentication-management/login-state-management/get?lang=zh-CN)
本身不要求业务权限，并在 `data.tenant_key` 返回当前企业标识。但官方 lark-cli
的 device flow 固定附加 `offline_access`，因此纯 lark-cli 方案的最小授权就是它。本包不会申请
通讯录、消息、文档、日历等权限。

根据应用和租户设置，应用管理员可能需要先开通“持续访问已授权的数据”、开启刷新
[user_access_token](https://open.feishu.cn/document/authentication-management/access-token/refresh-user-access-token?lang=zh-CN)
的安全设置并发布应用配置。

用户授权是累积的。本次最小授权不会撤销同一用户此前授予该应用的其他权限；严格隔离时应使用
独立应用/profile，或先在飞书/Lark 授权管理页撤销旧授权。

## 参数

```text
--setup            先配置 lark-cli，再授权并获取 tenant_key
--brand <brand>    与 --setup 一起使用：feishu 或 lark
--force-login      重新授权，适合切换飞书/Lark 账号
--profile <name>   使用指定的 lark-cli profile
--json             输出 {"tenant_key":"..."}
-v, --version      输出本包版本
-h, --help         显示帮助
```

示例：

```bash
lark-tenant-key --json
lark-tenant-key --profile work
lark-tenant-key --force-login
```

## 安全与隐私

- Access Token、Refresh Token 和 App Secret 由 lark-cli 管理，本包不会打印这些内容。
- 登录过程中，lark-cli 可能接收并在本机保存身份信息和 OAuth Token；调用用户信息接口时，本
  包装器只接收经过 lark-cli 过滤后的 `tenant_key`。
- 本包装器没有自建后端，也不会自行发送遥测。
- 官方 lark-cli 文档说明其默认会发送有限的操作系统/设备风控信号，详见其
  [安全说明](https://github.com/larksuite/cli#security--risk-warnings-read-before-use)。
- stdout 专用于最终 `tenant_key`。
- 意外响应中的控制字符和不可见 Unicode 格式字符会在输出前被拒绝。
- tenant_key 是组织标识而不是访问凭证，但真实客户标识仍应作为受控配置，不要提交到公开仓库。
- 子进程始终使用参数数组调用，不经过 shell 拼接。

数据流说明见 [PRIVACY.md](PRIVACY.md)，安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 常见问题

### lark-cli 尚未配置

运行：

```bash
lark-tenant-key --setup --brand feishu
# 国际版 Lark：lark-tenant-key --setup --brand lark
```

这会启动官方 lark-cli 配置流程，过程中可能要求在浏览器确认应用配置。

### 提示没有开通 `offline_access`

在当前 lark-cli profile 对应的应用后台开通“持续访问已授权的数据”。部分环境还要求安全评估或
发布新版本；没有应用管理权限时请联系管理员。

不要改用 `--recommend` 或 `--domain all` 绕过，这些选项会申请本工具并不需要的更多权限。

### 得到的企业不是预期企业

tenant_key 属于实际完成浏览器授权的账号所在企业。请检查浏览器账号，再使用 `--force-login` 或
独立的 `--profile`。

### Lark 与飞书是否都支持

创建 profile 时选择 `--brand lark` 或 `--brand feishu`。后续运行使用 profile 已保存的 brand，
本包不硬编码服务域名。

### 官方二进制下载失败

先尝试：

```bash
npm install --global @larksuite/cli --registry=https://registry.npmjs.org/
lark-cli --version
```

仍失败时，请放通官方 GitHub Release 下载地址，或按安装器提示配置企业二进制镜像/代理。不要通过
关闭 TLS 证书校验来绕过问题。若企业 macOS 策略强制要求所有二进制完成 notarization，还需要
申请例外或等待上游提供已 notarize 的 lark-cli 版本。

## 本地开发

```bash
npm ci
npm run check
npm test
npm run test:dependency
npm run pack:check
```

测试使用假的 lark-cli 进程，不会发起真实 OAuth，也不会访问飞书/Lark。

贡献与发布方式见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [RELEASING.md](RELEASING.md)。

## 许可证

[MIT](LICENSE)
