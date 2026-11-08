# dsh-flex-layout

DeepSeek Harness 的弹性布局插件。第一版以本机 DSH **0.2.1-rc.3** 为验证目标，让同一套 Web UI 随可用宽度调整，覆盖手机、平板和桌面窄窗口。

## 当前功能

- 小于 768px：旧版侧栏变为覆盖式抽屉，保留原生会话列表；提供开关、遮罩、Escape、焦点回收与键盘循环。
- 中间会话列使用 `minmax(0, 1fr)`，代码和图片不会把整页横向撑开。
- 输入工具栏弹性换行，保留原生输入框、发送与权限操作。
- 弹窗限制在可见区域内，内容可滚动。
- 用 Visual Viewport 跟随软键盘造成的可见高度变化，保留用户双指缩放，避让底部安全区。
- 宽屏保留宿主栏宽与拖动行为；识别到新宿主原生抽屉时，由宿主继续管理。

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

`src/layout.css` 保存布局规则；`src/client.ts` 管理生命周期、视口与抽屉。所有监听、样式、inert 状态与标记在卸载时清理。语义对话框以外的第三方自定义浮层尚未逐一适配。

## 验证

`npm test` 使用 Chromium 运行模拟宿主结构的布局回归，覆盖 320/390px 窄屏网格、抽屉、焦点隔离与循环、工具栏换行、弹窗、可见视口缩短与缩放、宽屏恢复、新版抽屉共存与卸载。

`npm run test:host` 使用本机 `dsh` 在独立 `work/host/dsh` 目录安装并启动测试 profile。只验证启动与页面布局，不发送模型请求；不会安装到日常 profile。默认使用 macOS Google Chrome，可用 `CHROME_PATH` 指定浏览器。

真机 iOS/Android、软键盘和复杂第三方插件组合仍需实际设备验证，浏览器模拟不等于真机验收。

本机 DSH 0.2.1-rc.3 的独立 profile 已通过插件加载、390px 主列、原生输入栏识别、侧栏开关与宽屏恢复检查。当前真实宿主检查使用空会话首页；长会话、文件面板和设置子页尚需继续回归。

## 设计参考

参考 [dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile) 的窄屏布局、安全区与兼容性经验，以及 [dsh-mobile](https://github.com/saya-ch/dsh-mobile) 的可见视口和触屏布局思路。本项目独立实现，未复制这两个项目的代码，也不安装或依赖它们。
