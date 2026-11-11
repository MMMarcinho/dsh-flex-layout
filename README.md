# dsh-flex-layout

DeepSeek Harness 的弹性布局插件。第一版以本机 DSH **0.2.1-rc.3** 为验证目标，让同一套 Web UI 随可用宽度调整，覆盖手机、平板和桌面窄窗口。

## 当前功能

- 分三层适配：frame 只决定导航抽屉；每个会话按自身可用宽高分配内容；每个输入框按其 composer 容器宽度收纳控件。桌面里的窄分栏和 430px 画布输入也会适配，不依赖整页进入手机断点。
- 手机竖屏（小于 768px）与窄横屏窗口（宽小于 1100px、高小于 600px）使用紧凑导航，旋转不重建会话或输入组件。高度不足 300px 的会话使用有界主区滚动，长历史仍留在原生滚动区域。
- 会话可用高度小于 600px 时先压缩头部留白；宽至少 600px 且宽大于高时，原生标题/操作区与 tabs 合为约 42px 单行。以会话容器及 1:1 Visual Viewport 测量，不依赖整页方向；长标题保留原生省略与完整可访问文本，所有按钮、tabs 与“更多”继续由宿主管理，旋转不更换 DOM。小于 320px 仍使用原有极小屏渐进布局。
- 左上入口复用 DSH 原生侧栏图标与主题，嵌入头栏；抽屉使用原生关闭按钮、会话列表与滚动，保留遮罩、Escape、焦点隔离与循环，选中会话后关闭。
- 输入框保留原生编辑器、模型选择、发送、权限与文件操作。长草稿独立滚动、底部留出光标空间，两行提示完整显示；模型控件交给宿主测量后选择紧凑显示。
- 底部统计默认单行摘要，右侧箭头可展开为两行或收起；保留原生活动、用量与上下文详情按钮，不复制统计数据。展开状态在同一输入组件旋转或切换视图时保留；极小屏可在各详情按钮内横向滚动完整标签。右侧面板及弹窗限制在可见范围内。
- 小于 320px 的会话采用极小屏渐进布局：保留文字字号、原生输入/发送/权限/模型控件，工具按需换行；主区可纵滚，统计默认单行、按需展开，完整标签可横滚查看。画布工具使用原生图标；真实极小视口中的导航菜单保持屏内滚动和触控关闭入口。不会把整套桌面界面等比缩小。
- 与 `dsh-canvas-workspace` 的原生 Conversation View 共存：竖屏分开回复画布、用户历史和输入区域；横屏自动变为左画布、右原生输入框，并将浮动工具栏收紧为 32px 原生图标按钮，减少纵向遮挡。保留平移、自动排布、导航菜单和当前草稿，短屏菜单整体滚动。
- 用 Visual Viewport 跟随软键盘造成的可见高度变化，保留双指缩放，避让底部安全区。
- 平板与宽屏保留宿主导航和栏宽偏好，内容区与控件按实际剩余空间自适应；中等宽度收起侧栏后的输入仍保留内侧留白。识别到新版原生抽屉后继续由宿主管理。
- 顶部视图继续复用原生标签与“更多”菜单。DSH 0.2.1-rc.3 按每项约 120px 估算可见数量，窄屏时第三项“画布”会进入“更多”，并非未加载；本插件不伪造测量宽度或改另一个插件的注册顺序。

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

`dist/` 由构建生成，安装前必须执行 `npm run build`。安装到指定 Web profile；如果本机 Web profile 是指向 Desktop profile 的符号链接，两者会共享这次插件更新。先检查实际 profile 路径，不要为了安装而拆分用户已有配置。npm 已发布版本与当前工作区可能不同，本地开发效果需安装本地构建。

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

- `npm run check`：TypeScript 检查及 Chromium 模拟宿主回归。覆盖 320/375/390/430px、667×375/844×390/932×430 横屏与旋转、草稿保留、长输入、底部换行、右侧面板、多个嵌入式输入、原生/兼容抽屉、焦点与完整卸载。另有头栏专项覆盖 599/600/601px 宽高断点、150/180/240px 短高度、长标题、容器内短窗、仅可见视口变矮、浏览器缩放、原生节点/键盘顺序及桌面恢复。
- `npm run test:host`：本机 DSH 的独立空首页 profile，验证插件加载、原生输入栏、侧栏开关与宽屏恢复。
- `npm run test:mobile`：真实 DSH **0.2.1-rc.3** 加本地构建的 `dsh-canvas-workspace`（验证版本 **0.2.4-experimental.2**）。默认从相邻 `../dsh-canvas-workspace` 加载，可用 `DSH_CANVAS_ROOT` 指定路径。使用 `work/mobile-regression` 下的独立 profile 和合成会话，覆盖手机聊天/画布横竖屏、768/820/900/1024px 平板、1100/1280/1440px 原生双栏、150/162/184/200/240px 极小视口与连续跨断点缩放；包含真实宿主横屏头栏几何/稳定性、对话/轨迹/画布与原生“更多”菜单、标题与工具节点保留、浮栏尺寸和左右侧栏检查；并用 Chromium CDP 在真实宿主画布中输入双指手势，验证缩放中心、双指平移、1→2→1 衔接、正常结束、菜单及草稿保留。使用多轮复杂合成历史、长统计标签、原生视图菜单、两侧面板、短屏画布菜单、原生统计详情、平移与自动排布、草稿保留、缩短的键盘视口、提示文案、长模型名、平板及桌面恢复。

`DSH_MOBILE_AUDIT_ONLY=1 DSH_MOBILE_SECTIONS=header node tests/mobile-host.mjs` 可在两插件已构建后只跑头栏集成专项；运行中不要重建任一插件，以免 HMR 干扰结果。可选 `DSH_HEADER_BASELINE_CSS` 指向已知旧版布局 CSS，测试会仅临时替换本插件样式并保存相同视口前后截图，之后恢复当前样式再断言。

真实宿主测试默认使用 macOS 已安装的 DeepSeek Harness 和 Google Chrome。所有会话、长统计标签与模型文案均为合成测试数据，不读取日常会话或继承模型凭据，不发送模型请求，不修改日常 profile，也不刷新正在使用的会话。测试截图和结果保存在忽略跟踪的 `work/` 中。

验证中的 150–240px 指 CSS 视口，不是手表物理像素。Safari 自身的地址/标签/分享工具栏由浏览器控制，网页插件不能压缩或移除；这里收紧的是 DSH 页内头栏及画布浮栏。真机 watchOS/iOS/Android、手表浏览器是否能完整运行 DSH、真实触控/软键盘/表冠输入、系统安全区与第三方插件组合仍需实际设备验证；Chromium 触屏/视口模拟不等于真机验收。极小屏需滚动访问内容，不保证所有功能同时显示。

## 设计参考

参考 [dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile) 的窄屏布局、安全区与兼容性经验，以及 [dsh-mobile](https://github.com/saya-ch/dsh-mobile) 的可见视口和触屏布局思路。本项目独立实现，未复制这两个项目的代码，也不安装或依赖它们。

### 横屏会话栏回归

横屏画布把已发送的用户消息与 DSH 原生输入框统一放在右栏，左栏画布使用完整可用高度。消息区独立滚动，随输入框和详情区增高收缩；不移动原生 React 节点，不丢草稿。短横屏不再继承竖向极小屏的 320px 内容最小高度。

`npm run check` 额外覆盖横屏双栏几何、输入命中、消息滚动、动态草稿高度、旋转恢复和尺寸观察稳定性。可设置 `DSH_CANVAS_CSS=/path/to/dsh-canvas-workspace/src/styles.css`，用实际插件样式替代内置最小布局合约。

`DSH_MOBILE_AUDIT_ONLY=1 DSH_MOBILE_SECTIONS=landscape node tests/mobile-host.mjs` 在隔离真实宿主中验证 600×320、667×375、844×390、932×430、1206×465、800×240，以及竖屏、198×242 与桌面切换。Linux 可通过 `DSH_TEST_NODE`、`DSH_TEST_CLI`、`CHROME_PATH` 指定已安装的 Node、DSH CLI 与 Chromium；默认仍使用 macOS 安装位置。所有输入仅填入草稿，不发送。

2026-11-11 在 Chromium 隔离环境完成上述横屏专项：DSH 0.2.1-rc.3 与 npm 最新 0.2.2-rc.1 均通过十种视口及草稿恢复检查，配合包含连续触控修复的 Canvas 构建。rc.1 的 Canvas 测试使用仅限该空白 profile、该插件版本与该 DSH 版本的兼容豁免；未修改插件的公开版本支持声明。未进行 iOS Safari 真机验收。
