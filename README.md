# Fashion Maze × Reactor

一个面向 SIGGRAPH hackathon 的 HTML/React 实时世界体验：用户以 fashion blogger 的身份从真实团队入口图进入由 Reactor LingBot World 2 生成的连续视频世界，并通过世界变体选择、WASD 与视角控制探索会实时变化的 fashion maze。

## 当前体验

- 一个基于团队 dataset、并保留原构图生成的 16:9 `Hedge Threshold` cast-ready hero entrance；
- 一张可从 HTML 打开的三视图 character reference，以及一段 invitation narrative；
- 三位来自团队 `models/` 角色表、从首帧就存在的 supporting models；松弛走动、眼神交流、自然聚合、共同 pose、短暂停留与散开都持续写在场景 prompt 中，不需要单独按钮；
- 三种保持同一角色、服装、跟随镜头和基础空间的 world transformation：Neon Canopy、Living Runway、Golden Circuit；
- 静态预览中即可点击三条 route 阅读 narrative，不会连接 Reactor；
- prompt 以 `base / camera / movement / route` 四层组织，WASD 在 still 与 moving 版本之间自动切换；
- 用户点击 `ENTER LIVE MAZE` 后才连接 Reactor；
- 参考图上传后，由 `conditions_ready` 事件触发 generation；
- seed 不会在黑色占位 track 刚出现时消失；generation 启动后，只有 track live/unmuted、视频播放中且连续两帧通过非黑像素检查才交叉淡出。20 秒仍无可见帧会自动断开保护 credits；seed 加载失败则回退原始入口图；
- 变体选择同时发送 hot-swapped prompt 与一段单-chunk 前进指令；确认生效后自动回到 idle 与 settled prompt；入口 seed 没有虚构的三岔口；
- `TAKE PHOTO` 或快捷键 `C` 会停止移动、发送一次性拍照 prompt，让 Blogger 掏出手机、构图并按下快门；匹配该 prompt 的新 `chunk_complete` 到达后，应用再从原始 Reactor video frame 保存 PNG；
- 每张照片会自动尝试下载，并保留带缩略图的 `PHOTO SAVED / DOWNLOAD` 回执；随后 release prompt 让 Blogger 收起手机、演员散开并恢复 ambient choreography；拍照动作有独立的 18 秒 watchdog；
- WASD 控制前后与横移，方向键控制视角；`MOUSE LOOK` 使用原生 `setCameraPose()` 与 video chunk 时钟；
- `OPERATOR` 抽屉显示 session、chunk、action、track、camera pose 和最终合成 prompt；
- 录制可用时，operator 可截取最近 10 秒，预览并下载 MP4；
- `keyup`、窗口失焦和页面隐藏都会归零控制状态；
- `END SESSION` 使用非 recoverable disconnect，立即释放 session；
- 每次 live session 有 5 分钟客户端 safety cap，到时自动断开；
- 入口 arming / start 另有 watchdog；事件迟迟未确认时会断开 session 保护 credits；
- 群像的“暂停”是 prompt-held pose，live generation 与计费仍继续；SDK `pause()` 在界面中明确写作 `FREEZE STREAM · STILL BILLED`；
- 页面明确区分 `STATIC PREVIEW`、`LIVE` 和 `PAUSED · STILL BILLED`。

## 安装与运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。静态预览不会请求 JWT，也不会创建 Reactor session。

应用优先读取服务端环境变量：

```bash
REACTOR_API_KEY=<your-reactor-api-key>
```

本地 hackathon 开发也可使用根目录的 `reactor.key`。所有 `*.key` 文件均被 Git 忽略，API key 不会进入浏览器；浏览器只从 `POST /api/reactor/token` 获得十分钟有效的短期 JWT。

## 内容包与 narrative

当前内容从 `/Users/addincui/Github/2026TheFashionMaze-Hack` 以只读方式吸收。可携带的原始 spec 与 14-scene registry 位于 [`content/authoring/`](./content/authoring/)，实际运行的入口图和角色图位于 [`public/dataset/`](./public/dataset/)，映射决策记录在 [`content/README.md`](./content/README.md)。运行时内容集中在 [`lib/fashion-maze.ts`](./lib/fashion-maze.ts)。每个 maze 的结构为：

```ts
interface FashionMaze {
  id: string;
  title: string;
  seedImage: string;
  characterImage?: string;
  seed: number;
  entrance: NarrativeBeat;
  basePrompt: string;
  promptLayers: {
    camera: { still: string; moving: string };
    movement: { still: string; moving: string };
  };
  ensemble: {
    count: 3;
    members: Array<{
      id: string;
      name: string;
      referenceImage: string;
      identityPrompt: string;
    }>;
    ambient: string;
  };
  photoAction: {
    capture: string;
    release: string;
  };
  routes: MazeRoute[];
}
```

新增图片时放进 `public/dataset/`，然后把 `seedImage` 改为 `/dataset/your-image.jpg`。正式 seed 建议使用 16:9 PNG、JPEG 或 WebP。当前运行时使用 `hedge-threshold-plan-montage-v4.png`；原始 `hedge-threshold.png` 保留作构图与回退依据。新图从第一帧锚定一位 blogger，以及团队角色表定义的 Ember Court、Forest Tailor、Silver Architect 三位 physical supporting models，并把三人放在各自松弛、彼此有眼神联系的 pre-show blocking 中，避免 live prompt 临时召人造成 pop-in、人数漂移或换脸。三张原始角色表的只读副本位于 `public/dataset/models/`，HTML 会显示可点开的 cast references。`characterImage` 只用于 HTML concept reference；当前 LingBot `setImage()` 每次接受一个 seed，因此不会把任何三视图角色表误当成额外的实时 conditioning image。

每条 `route` 同时包含观众看到的 narrative 和模型看到的 `promptDelta.transition / settled`。选择变体时，首个 forward chunk 使用一次性 transition；chunk 完成后立即换成没有生长、出现或攀爬过程动词的 settled prompt。之后普通 WASD 只切换 camera/movement 层，不会再次触发 world morph。`composeWorldPrompt()` 会把场景身份、still/moving 镜头层、路线结果、持续群像与临时拍照动作组合为一次完整 `setPrompt()`。route 与 photo action 互斥，普通 prompt effect 在临时动作期间不会覆盖它们。当前最长组合约 2.2k characters，接近 authoring spec 的约 2k 建议而仍保留角色身份与连续性约束。这种结构吸收自官方 `create-reactor-app` 的 layered scene 模式，但保留为面向 Fashion Maze 内容团队的轻量数据结构，而不是复制通用 prompt editor。

原始 spec 的第一人称建议面向“纯 installation reference image”；本次实际 opening frame 已经建立了可见的第三人称角色。当前实现以图片为约束，保持一个 blogger、同一套银色服装、两米跟随镜头和连续的 hedge architecture。第一人称与第三人称的最终选择应通过一次明确的小额 Reactor canary 比较，而不是在 prompt 中同时要求两者。

当前照片保存的是拍照动作确认后、无 HTML 覆盖的原始 Reactor 主视频帧。拍照 prompt 会将连续镜头平滑推到手机上方的近距离 over-shoulder 构图，因此它接近 Blogger 的取景，但不是 SDK 提供的独立手机 POV track。真正的双视角摄影需要后续增加独立 still generation 或第二路视角。源 authoring spec 曾把拍照写为 `P`，当前运行时以产品需求为准使用 `C`；本项目未实现原 spec 中与 `C` 冲突的 crouch。

## Reactor 架构

- `@reactor-team/js-sdk@2.12.1`
- `@reactor-models/lingbot-world-2@0.3.3`
- 模型：`reactor/lingbot-world-2`
- 输出 track：`main_video`
- Token broker：`app/api/reactor/token/route.ts`
- React/session/controller：`components/FashionMazeExperience.tsx`

官方模板中吸收了四项能力：layered prompt composition、chunk-driven native camera pose、base-SDK session clip、operator telemetry。通用案例库、完整 layered editor、jump/crouch/orbit 控制和第二套 token route 没有进入产品代码，避免维护两套应用。

`pause()` 只暂停生成，不释放 GPU，也不会停止计费。真正结束体验必须点击 `END SESSION` 或调用默认的 `disconnect()`。

### 部署安全边界

当前 token broker 面向本机或受控的 hackathon operator 网络，没有登录与分布式限流。不要直接把它暴露成公开网站；公开部署前应在 hosting / reverse proxy 层加入 operator authentication 和 rate limit。根目录的 `reactor.key`、`openai.key` 虽然是 `0600` 且被 `*.key` 忽略，但手工 zip 或上传整个文件夹时仍必须显式排除。正式部署只使用平台 secret `REACTOR_API_KEY`。

## 验证

```bash
npm run typecheck
npm run build
```

不要在自动测试中点击 live 入口；真实连接测试应作为显式的 credit-spending canary 单独执行。

`submission/oneshot/` 是独立交付包，本应用不会读取其中内容或根目录的 `openai.key`。
