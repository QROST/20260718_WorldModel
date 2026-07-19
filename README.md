# Fashion Maze × Reactor

一个面向 SIGGRAPH hackathon 的 HTML/React 实时世界体验：用户从真实团队 rose-garden 入口图进入由 Reactor LingBot World 2 生成的连续视频世界，并通过世界变体选择、WASD 与视角控制探索会实时变化的 fashion maze。

## 当前体验

- 三张来自团队 dataset 的 1376×768 rose-garden entrance；服务端在每次打开页面时随机选择一张，单次页面与 Reactor session 始终锁定同一张图片和对应 opening prompt；
- 同一组五位从首帧就存在的 white-and-cobalt couture performers；所有人物保持各自 opening mark，以呼吸、轻微重心变化、叉腰、松肩、摆头和独立目光变化维持自然的 fashion-show plan montage，不被镜头移动驱动，也不在场景里走动或重新聚拢；Tailored Host 只在显式拍照 choreography 中成为摄影者；
- 入口只保留 `THE INVITATION` 与小字 narrative，不显示抢占画面的 entrance 大标题；route narrative 的标题仍会正常出现；
- 三种保持同一角色、服装、观察者镜头和基础空间的 world transformation：Neon Canopy、Living Runway、Golden Circuit；
- 静态预览中即可点击三条 route 阅读 narrative，不会连接 Reactor；
- prompt 以 `base / camera / movement / route` 四层组织；普通探索使用单一 observer-invariant prompt，WASD、方向键与鼠标不会因按下或松开而 hot-swap prompt；
- 用户点击 `ENTER LIVE MAZE` 后才连接 Reactor；
- 参考图上传后，由 `conditions_ready` 事件触发 generation；
- seed 不会在黑色占位 track 刚出现时消失；generation 启动后，只有 track live/unmuted、视频播放中且连续两帧通过非黑像素检查才交叉淡出。20 秒仍无可见帧会自动断开保护 credits；
- 变体选择同时发送 hot-swapped prompt 与一段单-chunk 前进指令；确认生效后自动回到 idle 与 settled prompt；入口 seed 没有虚构的三岔口；
- `TAKE PHOTO` 或快捷键 `C` 会停止观察者镜头并运行一段约 8–10 秒的生成式拍照 choreography：`READY → 1 → 2 → 3 → CHEESE! → SHUTTER`。每一拍必须由匹配 prompt 的 2–3 个新 `chunk_complete` 驱动；Host 掏出手机并在手机旁用克制但清楚的手势倒数，被拍摄的四位模特留在原地、看向手机镜头，并各自保持一次到位的 hand-at-waist、drape、hip 或 lapel editorial pose；只允许极轻微的下巴、肩膀和表情调整，不靠近、不挥手、不做夸张动作；
- `SHUTTER` 保持完成后，应用才从原始 Reactor video frame 保存 PNG；照片会自动尝试下载，并保留带缩略图的 `PHOTO SAVED / DOWNLOAD` 回执。随后 3 个 release chunks 让 Host 收起手机、其他模特在原位放松目光并回到微动作 tableau，再等待一个真实 ambient prompt chunk 才解锁控制；每一拍有独立的 30 秒 watchdog，恢复失败会自动断开保护 credits；
- WASD 只控制观察者镜头的前后与横移，方向键只控制镜头视角；没有任何人物会跟随输入移动、转身或追踪镜头。`MOUSE LOOK` 使用原生 `setCameraPose()` 与 video chunk 时钟；
- `OPERATOR` 抽屉显示 session、chunk、action、track、camera pose 和最终合成 prompt；
- 录制可用时，operator 可截取最近 10 秒，预览并下载 MP4；
- `keyup`、窗口失焦和页面隐藏都会归零控制状态；
- `END SESSION` 使用 non-recoverable disconnect；输入归零只会等待最多 750ms，不能阻塞释放 session；
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
  openingPrompt: string;
  entranceVariants: Array<{
    id: string;
    label: string;
    seedImage: string;
    seed: number;
    openingPrompt: string;
  }>;
  characterImage?: string;
  seed: number;
  entrance: NarrativeBeat;
  basePrompt: string;
  promptLayers: {
    camera: { still: string; moving: string };
    movement: { still: string; moving: string };
  };
  ensemble: {
    count: 5;
    members: Array<{
      id: string;
      name: string;
      referenceImage?: string;
      identityPrompt: string;
    }>;
    ambient: string;
  };
  photoAction: {
    continuity: string;
    beats: Array<{
      mode: string;
      cue: string;
      holdChunks: number;
      prompt: string;
    }>;
    release: string;
    releaseHoldChunks: number;
  };
  routes: MazeRoute[];
}
```

新增图片时放进 `public/dataset/`，并为 `entranceVariants` 增加稳定的 `id / seedImage / seed / openingPrompt`。正式 seed 建议使用 16:9 PNG、JPEG 或 WebP。当前三张图位于 `public/dataset/rose-garden/`；它们共享五人身份、服装和空间 prompt，但各自用简短的 opening continuity anchor 锁定初始站位。随机选择发生在动态 Server Component，并把 variant id 传给客户端，因此不会产生 hydration mismatch，也不会在用户点击 `ENTER` 时更换 seed。

每条 `route` 同时包含观众看到的 narrative 和模型看到的 `promptDelta.transition / settled`。选择变体时，首个 forward chunk 使用一次性 transition；chunk 完成后立即换成没有生长、出现或攀爬过程动词的 settled prompt。普通 WASD、方向键与鼠标只发送 SDK 原生 camera input，不根据按键状态调用 `setPrompt()`，因此人物微动作与偶尔回望不会被镜头行动触发。`composeWorldPrompt()` 会把场景身份、镜头层、路线结果、固定站位群像与临时拍照动作组合为一次完整 prompt。opening anchor 现在以 world-space root / footprint 描述并在整个普通探索中保持，不再用与镜头透视冲突的屏幕大小或深度锁；route 与 photo action 也继续携带同一站位锚。两者互斥；拍照状态机使用本地单调 chunk serial，即使 Reactor run 内的 `chunk_index` 归零也不会提前推进。三条初始 prompt 为 1.72–1.82k characters，最长组合为 1.99k，保持在项目 authoring spec 的约 2k 预算内。

当前实现把玩家定义为不可见的 observer camera，而不是任何一位画面人物；中央白色西装男模仅作为 Tailored Host 和拍照动作的摄影者。五人、白蓝服装、粉色几何迷宫和垂花树冠在镜头探索时保持独立连续。

当前照片保存的是拍照动作确认后、无 HTML 覆盖的原始 Reactor 主视频帧。拍照 prompt 保留宽幅 editorial 构图，只向 Tailored Host 右肩方向轻微漂移并让手机保持在画面下缘，因此接近 Host 的取景，但不是 SDK 提供的独立手机 POV track。真正的双视角摄影需要后续增加独立 still generation 或第二路视角。

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
