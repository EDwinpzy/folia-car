# Android 车机版

本页说明 Folia 在 Android 车机上的独立入口、系统媒体集成、交互取舍和验证边界。当前目标车型包括比亚迪方程豹 5（DiLink）。车机版与手机版共用同一个 APK、Capacitor 容器、在线曲库、本地曲库与播放引擎，但使用单独的横屏渲染入口。

## 入口与目录

| 项目 | 位置 |
| --- | --- |
| 车机网页入口 | `car.html` |
| 车机渲染入口 | `src/car/` |
| 单入口路由 | `android/app/src/main/java/top/izuna/foliamajor/EntryActivity.java` |
| 车机原生 Activity | `android/app/src/main/java/top/izuna/foliamajor/CarActivity.java` |
| 共用播放界面 | `src/tv/TvApp.tsx`、`src/tv/` |
| 原生媒体服务 | `android/app/src/main/java/top/izuna/foliamajor/FoliaPlaybackService.java` |

同一 APK 只声明一个桌面入口 `EntryActivity`，它同时带有 `APP_MUSIC` 分类。设备声明 Android Automotive 特性、当前处于车机 UI 模式，或 Build 标识属于 BYD/Fangchengbao/方程豹时，入口转到 `CarActivity`；其他设备继续进入手机界面，因此手机和车机桌面都不会出现重复图标。DiLink 这类定制车机不一定声明 AAOS 特性，也可能把 `uiMode` 报成普通平板，因此需要车型标识兜底。

`CarActivity` 继承 `TvActivity` 的横屏、沉浸式、WebView 焦点和恢复逻辑，只替换启动页并让硬件音量键控制媒体音量。`TvApp` 通过 `variant="car"` 启用车机控制台、降低装饰动画并切换到车机默认焦点。

## 系统媒体集成

`FoliaPlaybackService` 是系统可发现的 `MediaBrowserService`，同时继续提供前台播放通知、封面、`MediaSession` 和媒体键控制。

- Manifest 声明 `android.media.browse.MediaBrowserService`。
- 单入口 `EntryActivity` 声明 `android.intent.category.APP_MUSIC`，让系统默认音乐应用的选择器可以发现本应用。
- `MediaSession` 处理播放、暂停、上一首、下一首、停止、拖动和媒体浏览器的队列选择。
- 部分 DiLink 车机把方向盘或车机面板的媒体键直接投递给前台 Activity；`CarActivity` 会把播放/暂停、上一首、下一首和停止转换成同一套媒体动作，并同时消费按下与抬起事件，避免 WebView 重复处理。
- 播放状态会把当前曲目和最多 300 首队列快照发布给原生媒体浏览器；队列项通过 `queue:<index>` 媒体 ID 选择。
- 语音搜索通过 `MediaSession.Callback.onPlayFromSearch` 进入现有 `VOICE_PLAY` 通道，再交给 Omni 搜索并播放。
- 媒体浏览器选择队列项后，原生桥会保存一次性请求；即使 Activity 是冷启动，车机页面也会在曲库恢复后消费该请求。
- 语音只给空查询（例如“播放音乐”）时，会恢复当前歌曲；没有当前歌曲则按本地曲库、喜欢列表的优先级启动，而不是忽略命令。
- `EntryActivity` 同时接收 Android 官方标准 `android.media.action.MEDIA_PLAY_FROM_SEARCH`、`android.intent.action.MEDIA_SEARCH` 和本项目的 `VOICE_PLAY`，供实现了开放媒体搜索接口的车机助手直接发起点歌。

Android 没有应用可以静默把自己设为默认音乐播放器的通用 API。车机首页不再提供“默认播放器”快捷按钮；请在车机系统的“默认应用”设置中选择本应用。不同 OEM 的入口名称和层级可能不同，最终选择必须由用户完成。

本项目编译所用的 Android API 36.1 公开 `RoleManager` 没有音乐角色（没有 `ROLE_MUSIC`），因此不能实现成一次静默授权。`APP_MUSIC`、`MediaBrowserService` 和 `MediaSession` 负责让系统发现并接入本应用；默认应用归属仍由 OEM 的默认应用选择器或车机设置决定。

## 方程豹 5 / DiLink 语音边界

小迪语音在 DiLink 上对第三方音乐应用通常只下发标准媒体控制（播放、暂停、上一首、下一首、音量），这些命令由本应用的 `MediaSession` 接收，不依赖比亚迪私有协议。播放/暂停和切歌应在车机已经建立媒体会话后生效；车机未启动过应用时，桌面入口或默认音乐应用选择仍由 DiLink 决定。

比亚迪没有公开第三方应用的点歌搜索 API。若某版 DiLink 语音调用了 Android 标准 `onPlayFromSearch` 或 `MEDIA_PLAY_FROM_SEARCH`，本应用会搜索当前 Omni 平台并直接播放；若小迪只在其自有媒体中心内点歌，本应用无法截获该私有请求。出现这种情况时只能在车机侧设置默认音乐应用或使用车机支持的第三方语音桥，不能靠监听未公开广播伪装成官方集成。

外部脚本或已验证的语音桥可以用显式 Intent 发起点歌：

```powershell
adb shell am start -a top.izuna.foliamajor.action.VOICE_PLAY `
  --es query "周杰伦 晴天" `
  -n top.izuna.foliamajor/.EntryActivity
```

## 车机交互

- 1280×720 等横屏大屏优先展示当前曲目、播放/暂停、上一首、下一首，以及当前队列、最近播放和喜欢歌曲；首页不再加载在线电台、歌单和专辑首页流。
- 队列、最近播放和喜欢歌曲使用车机专用的大尺寸海报网格：1920×1080 为 5 列，1280×720 为 4 列，窄屏降为 3 列或 2 列。卡片保持大触控面积，可直接点按播放。
- “最近播放”读取 Folia 自己的播放记录，合并本机歌曲与当前在线账户最近七天的记录；未登录时读取游客在线记录，不再把“最近添加”当成播放历史。
- 首页队列只取当前位置附近的一小段，最近播放和喜欢歌曲也限制为 14 首，完整队列留在播放页，避免长列表拖慢车机 WebView。
- 底部控制台采用大尺寸玻璃面板：左侧显示封面、曲名、歌手、进度与时间，中段固定上一首/播放暂停/下一首，最右侧保留独立的播放队列按钮；不再显示扫描、导入和默认播放器快捷按钮。
- 车机控制台、播放页和实体媒体键的“上一首”始终切到上一曲，不沿用 TV 遥控器“播放超过三秒先回到当前曲开头”的重播语义。
- 车机播放页只保留上一首、播放/暂停、下一首和队列；歌词样式与背景动效入口仅在 TV 模式显示。
- 保留 TV 的几何方向键焦点系统；初始焦点为车机播放键，网格内可用上下左右键按屏幕位置移动。
- 播放页支持触屏：左滑切到下一首、右滑回到上一首，轻触画面显示标题、进度和传输控制。
- 播放页进入后控制层默认隐藏；车机控制层在 10 秒无操作后自动隐藏，每次触摸会重新计时。
- 车机播放页和弹窗不显示返回或关闭按钮；点弹窗外空白处，或使用系统 Back/车机手势逐层退出。
- 车机模式天然使用 constrained 性能档：关闭轨道装饰、背景光斑和按钮弹性动画，降低持续渲染负担。
- 车机不再显示“后台播放/退出应用”确认层。Back 键逐层关闭弹窗、返回首页，首页再按一次直接退到后台，播放继续。

## 旧车机 WebView 兼容

部分 Android 11 车机的系统 WebView 仍停留在 Chromium 83。车机入口需要同时处理以下几类兼容问题：

- Capacitor 构建通过 `FOLIA_BUILD_TARGET=capacitor` 把 JS 目标设为 `chrome83`，同时把 `cssTarget` 设为 `chrome83`，避免压缩器重新生成旧 WebView 不识别的 `inset` 简写。
- 关键定位容器保留显式 `top/right/bottom/left`，`inset` 只作为现代浏览器的补充。
- `car.html` 在模块脚本之前同步加载 `public/carLegacyWebViewPolyfills.js`，补齐 `Object.hasOwn`、`Array/TypedArray.prototype.at`、`String.prototype.replaceAll`、`AbortSignal.timeout`、`crypto.randomUUID` 和 `Intl.Segmenter`。
- 车机冷启动时 WebView 可能把焦点自动放回首屏 Hero；`useCarInitialFocus` 在 5 秒内把焦点纠正到 `car-play`，首次键盘、指针或触摸输入后立即停止干预。
- Chromium 83 会忽略整个 `@layer` 块，Tailwind 的布局和视觉工具类因此全部失效；只有车机 Capacitor 构建会在打包阶段扁平化这些 cascade layers 并保留原声明顺序，播放页不会再把歌词压缩到左上角。手机、TV 与现代 Web 构建保留原有层叠语义。

车机首页和播放页的核心流程已在 Chromium 83 验证。播放页仍可能使用较新的 `color-mix()`、`@property`、容器查询或运行时注入的 mod 样式，这些高级视觉能力可能降级，不能据此保证所有主题和 mod 完整可用；更老的 WebView 也需单独验证。

## 本地音乐

车机页面仍复用现有 Android 本地曲库和原生回环 HTTP 播放能力。本版车机首页不提供扫描或导入快捷入口，已有本地歌曲会照常出现在车机曲库中。

## 构建

```powershell
$env:ANDROID_HOME = '<Android SDK 路径>'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME = '<JDK 21 路径>'

npm run typecheck
npm run test:unit -- test/unit/tv
npm run build:android:car:debug
```

APK 输出：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

开发时可用 `npm run dev:car` 打开 `/car.html`。`npm run build:android:tv:debug` 仍用于 TV 入口，两者共用同一 Android 工程。

## 验证边界

已可在 Android 构建中检查 Manifest、`MediaBrowserService`、`APP_MUSIC`、车机 Activity、语音搜索 action 和 APK 产物。浏览器或 TV 模拟器只能验证横屏布局、触控尺寸和方向键焦点，不能替代真实车机。

仍需真实设备验证：

- OEM 车机 Launcher 是否展示应用，以及默认音乐播放器设置的实际入口。
- 方向盘媒体键、蓝牙媒体键和系统语音助手的行为。
- Android Automotive OS 上的媒体浏览、驾驶限制和后台策略。
- 音频焦点、来电中断、倒车/熄屏时的播放行为。
- 不同屏幕尺寸、亮度、GPU 和车机 WebView 版本的性能与可读性。
- 方程豹 5 实车的小迪语音点歌、默认音乐应用列表和方向盘媒体键。

## 已知限制

- 音频仍由 Activity 内 WebView 的 `HTMLAudioElement` 解码；进程被系统彻底杀死或用户划掉任务后，不能保证继续播放。
- 若要获得完整车载媒体生命周期，下一步需要把解码迁移到原生 Media3/ExoPlayer，并让 `MediaSession` 与实际音频播放器共用状态。
- `APP_MUSIC` 能被系统发现不等于 OEM 会把它列为默认音乐应用；部分车机只在自己的媒体中心或语音助手中维护默认播放器。
- 比亚迪 DiLink 的私有语音点歌 API 未公开；本应用只能保证标准媒体控制，以及车机主动调用标准媒体搜索时的点歌。
