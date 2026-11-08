# dsh-flex-layout

DeepSeek Harness 的弹性布局插件。第一版以本机 DSH **0.2.1-rc.3** 为验证目标，让同一套 Web UI 随可用宽度调整，覆盖手机、平板和桌面窄窗口。

## 当前功能

- 手机竖屏（小于 768px）与窄横屏窗口（宽小于 1100px、高小于 600px）使用紧凑布局，旋转不重建会话或输入组件。
- 左上入口复用 DSH 原生侧栏图标与主题，嵌入头栏；抽屉使用原生关闭按钮、会话列表与滚动，保留遮罩、Escape、焦点隔离与循环，选中会话后关闭。
- 输入框保留原生编辑器、模型选择、发送、权限与文件操作。长草稿独立滚动、底部留出光标空间，两行提示完整显示；模型控件交给宿主测量后选择紧凑显示。
- 底部活动/用量信息自然换行，仍可打开原生详情；右侧面板及弹窗限制在可见范围内。
- 与 `dsh-canvas-workspace` 的原生 Conversation View 共存：竖屏分开回复画布、用户历史和输入区域；横屏自动变为左画布、右原生输入框。保留平移、自动排布、导航菜单和当前草稿，短屏菜单整体滚动。
- 用 Visual Viewport 跟随软键盘造成的可见高度变化，保留双指缩放，避让底部安全区。
- 平板与宽屏保留宿主布局和栏宽偏好；识别到新版原生抽屉后继续由宿主管理。

## npm 安装

可直接安装到 Web profile：

```sh
dsh plugin --profile web add dsh-flex-layout@0.1.0
```

安装完成后重启对应的 DSH profile。npm 包包含构建后的 `dist/`，无需下载源码或手动构建。

## 本地开发和安装

```sh
cd ~/github/dsh-flex-layout
npm install
npm run check
dsh plugin --profile web add link:/Users/marco/github/dsh-flex-layout
dsh web
```

`dist/` 由构建生成，安装前必须执行 `npm run build`。Web profile 与 Desktop profile 分别管理；上面的命令仅安装到 Web。首次开发没有自动修改你正在使用的 DSH 配置。

更新源码后重新构建并重启相应 profile。卸载：

```sh
dsh plugin --profile web remove dsh-flex-layout
```

## 工程边界

此插件只处理布局，不提供远程访问、认证、隧道、数据压缩或会话操作接口。与其他会重写布局的插件同时启用可能冲突。

客户端只依赖宿主的 `layout.toggleSidebar()` 服务；无需 React 副本。`src/adapter.ts` 集中管理私有 DOM 兼容：通过 CSS module 的语义后缀与直接子栏结构验证宿主，不绑定 hash，也不依赖第几个子元素。未知结构不会被改造成抽屉。升级 DSH 后仍需回归验证；未来版本没有兼容承诺。

`src/layout.css` 保存紧凑布局规则；`src/client.ts` 管理生命周期、视口与抽屉，并观察画布与历史区域尺寸。所有监听、样式变量、inert 状态与标记在卸载时清理。画布兼容规则仅针对 `dsh-canvas-workspace` 的 `data-canvas-conversation-view` 入口与现有 class 合约，其他第三方自定义浮层尚未逐一适配。

## 验证

```sh
npm run check
npm run test:host
npm run test:mobile
```

- `npm run check`：TypeScript 检查及 Chromium 模拟宿主回归。覆盖 320/375/390/430px、667×375/844×390/932×430 横屏与旋转、草稿保留、长输入、底部换行、右侧面板、多个嵌入式输入、原生/兼容抽屉、焦点与完整卸载。
- `npm run test:host`：本机 DSH 的独立空首页 profile，验证插件加载、原生输入栏、侧栏开关与宽屏恢复。
- `npm run test:mobile`：真实 DSH **0.2.1-rc.3** 加本地构建的 `dsh-canvas-workspace`（验证版本 **0.2.4-experimental.2**）。默认从相邻 `../dsh-canvas-workspace` 加载，可用 `DSH_CANVAS_ROOT` 指定路径。使用 `work/mobile-regression` 下的独立 profile 和合成会话，覆盖 14 个聊天/画布横竖屏组合、原生视图菜单、两侧面板、短屏画布菜单、原生统计详情、平移与自动排布、草稿保留、缩短的键盘视口、提示文案、长模型名、平板及桌面恢复。

真实宿主测试默认使用 macOS 已安装的 DeepSeek Harness 和 Google Chrome。所有会话、长统计标签与模型文案均为合成测试数据，不读取日常会话或继承模型凭据，不发送模型请求，不修改日常 profile，也不刷新正在使用的会话。测试截图和结果保存在忽略跟踪的 `work/` 中。

真机 iOS/Android、真实软键盘弹出与第三方插件组合仍需实际设备验证；浏览器触屏/视口模拟不等于真机验收。

## 设计参考

参考 [dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile) 的窄屏布局、安全区与兼容性经验，以及 [dsh-mobile](https://github.com/saya-ch/dsh-mobile) 的可见视口和触屏布局思路。本项目独立实现，未复制这两个项目的代码，也不安装或依赖它们。
