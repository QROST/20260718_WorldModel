# Fashion Maze × Reactor

一个面向 SIGGRAPH hackathon 的 HTML/React 实时世界体验：用户从真实团队 rose-garden 入口图进入由 Reactor LingBot World 2 生成的连续视频世界，并通过世界变体选择、WASD 与视角控制探索会实时变化的 fashion maze。

## 当前体验

- 三张来自团队 dataset 的 1376×768 rose-garden entrance；服务端在每次打开页面时随机选择一张，单次页面与 Reactor session 始终锁定同一张图片和对应 opening prompt；
- 同一组五位从首帧就存在的 white-and-cobalt couture performers；所有人物保持各自 opening mark，以及 seed 中每条腿与脚原有的位置、高度、角度和接触状态，以长时间 runway hold、低频眨眼、几乎不可见的呼吸与极小目光变化维持稳重的 fashion-show tableau；不换脚、不转移重心、不原地踏步，也不被镜头移动驱动；
- 入口只保留 `THE INVITATION` 与小字 narrative，不显示抢占画面的 entrance 大标题；route narrative 的标题仍会正常出现；
- 三种保持同一角色、服装、观察者镜头和基础空间的 world transformation：Neon Canopy、Living Runway、Golden Circuit；
- 第一幕提供 `ENTER THE BLACK DOOR`：模型先在当前镜头正前方约八米处生成带微弱冷色轮廓光的实体黑色 door-gate，并用两个完整 chunks 让门形成并保持；镜头不再转向，而是沿当前 forward axis 缓慢直走，最多允许八个真实 `forward` chunks 完成远距离接近与穿门。只有首个真实前进 chunk 已确认后才检测黑场；整幅视频至少 94% 黑、平均亮度低于 8 且连续满足四帧，才允许固定全屏黑幕覆盖并 reset。没有按固定 chunks 提前切幕的成功兜底；无法确认彻底入门时会断开保护 credits；
- 黑幕完全覆盖后，应用在同一 Reactor 连接中执行 `reset → setSeed → setImage → setPrompt → start`，启动 `CHAPTER 02 · The Cyberpunk Garden`。服务端会从 `/dataset/cyberpunk-garden/scene2.png`、`scene3b.png`、`scene5.png` 中随机锁定一张；转场中不会再次跳图；
- 第二幕保留三张 seed 共同的五位黑色 couture 人物与赛博 portal atrium，每个 variant 用独立 opening anchor 锁定原图中的站位、支撑腿、悬空脚、跪姿和肢体角度。新 Prompt chunk 与连续可见帧都确认后，黑幕才用 1.1 秒渐隐；
- 第二幕提供 `ENTER THE NEXT BLACK DOOR`，复用相同的正前方远门、缓慢直行、完整入门与黑场 reset 流程，目标是独立注册的 `CHAPTER 03`；第二幕没有 route，但会自动使用共享拍照流程，WASD 与视角控制仍可使用；
- 第三幕是 `The Asian Sculpture Garden`，使用 `/dataset/asian-sculpture-garden/grand-finale.png`：六位银白 couture 人物保持各自固定站位与 seed 姿势；S04 的举臂和 S05 的展开双臂被定义为已经完成的静止轮廓，禁止挥动、重复或引发模仿。共享拍照流程会按 `ensemble.count = 6` 指挥全部六人；
- 第三幕提供第三个 `ENTER THE NEXT BLACK DOOR`，目标是独立注册的 `CHAPTER 04`。第四幕目前是 `The Rose Garden Encore` 占位场景，独立随机复用第一幕三张图片，但不会逻辑倒退成第一幕；
- 静态预览中即可点击三条 route 阅读 narrative，不会连接 Reactor；
- prompt 以 `base / camera / movement / route` 四层组织；普通探索使用单一 observer-invariant prompt，WASD、方向键与鼠标不会因按下或松开而 hot-swap prompt；
- 用户点击 `ENTER LIVE MAZE` 后才连接 Reactor；
- 参考图上传后，由 `conditions_ready` 事件触发 generation；
- seed 不会在黑色占位 track 刚出现时消失；generation 启动后，只有 track live/unmuted、视频播放中且连续两帧通过非黑像素检查才交叉淡出。20 秒仍无可见帧会自动断开保护 credits；
- 变体选择同时发送 hot-swapped prompt 与一段单-chunk 前进指令；确认生效后自动回到 idle 与 settled prompt；入口 seed 没有虚构的三岔口；
- 每一幕默认都有 `TAKE PHOTO` 与快捷键 `C`，并共享同一段约 4–6 秒的通用流程：`LOOK HERE → HOLD → SHUTTER`。流程根据当前 scene 的 `ensemble.count` 描述全部 seed-visible performers，不包含 `M01–M05`、固定人数、服装或场景名称；未来新增 Chapter 无需复制拍照配置。人物只做最小幅度的眼神、头部和必要时的肩部转动，不能为露脸而扭曲原姿势；无人物场景则固定环境构图；
- `SHUTTER` 保持完成后，应用才从原始 Reactor video frame 保存 PNG；照片会自动尝试下载，并保留带缩略图的 `PHOTO SAVED / DOWNLOAD` 回执。随后 2 个 release chunks 让当前 subjects 在原位放松目光并回到各自 scene 的 ambient hold，再等待一个真实 ambient prompt chunk 才解锁控制；每一拍有独立的 30 秒 watchdog，恢复失败会自动断开保护 credits；
- WASD 只控制观察者镜头的前后与横移，方向键只控制镜头视角；没有任何人物会跟随输入移动、转身或追踪镜头。`MOUSE LOOK` 使用原生 `setCameraPose()` 与 video chunk 时钟；
- `OPERATOR` 抽屉显示 session、chunk、action、track、camera pose 和最终合成 prompt；
- 录制可用时，operator 可截取最近 10 秒，预览并下载 MP4；
- `keyup`、窗口失焦和页面隐藏都会归零控制状态；
- `END SESSION` 使用 non-recoverable disconnect；输入归零只会等待最多 750ms，不能阻塞释放 session；
- 每个可见场景有 30 秒倒计时；到时自动触发该场景已有的黑门并进入下一幕，切换完成后重新从 `00:00 / 00:30` 计时；没有下一幕的最终场景到时才自动断开并释放 session；
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
  entrySelectable?: boolean;
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
  defaultDestinationPrompt: string;
  promptLayers: {
    camera: { still: string; moving: string };
    movement: { still: string; moving: string };
  };
  ensemble: {
    count: number;
    members: Array<{
      id: string;
      name: string;
      referenceImage?: string;
      identityPrompt: string;
    }>;
    ambient: string;
  };
  photoAction?: { // optional scene-specific override
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
  sceneTransition?: {
    targetSceneId: string;
    buttonLabel: string;
    continuity?: string;
    portal: { summon: string; enter: string };
  };
  routes: MazeRoute[];
}
```

新增图片时放进 `public/dataset/`，并为 `entranceVariants` 增加稳定的 `id / seedImage / seed / openingPrompt`。正式 seed 建议使用 16:9 PNG、JPEG 或 WebP。第一幕三张图位于 `public/dataset/rose-garden/`，第二幕三张图位于 `public/dataset/cyberpunk-garden/`，第三幕单图位于 `public/dataset/asian-sculpture-garden/`，第四幕暂时再次引用 rose-garden 组。每组共享各自的人物、服装和空间 Prompt，但每张都有 opening continuity anchor 锁定初始站位与姿势。随机选择发生在动态 Server Component，它会一次性为四个 Chapter 分别选定 variant id 并传给客户端，因此不会产生 hydration mismatch，也不会在黑门转场过程中再次换 seed；第一幕与第四幕的随机结果彼此独立。

每条 `route` 同时包含观众看到的 narrative 和模型看到的 `promptDelta.transition / settled`。选择变体时，首个 forward chunk 使用一次性 transition；chunk 完成后立即换成没有生长、出现或攀爬过程动词的 settled prompt。普通 WASD、方向键与鼠标只发送 SDK 原生 camera input，不根据按键状态调用 `setPrompt()`，因此人物微动作与偶尔回望不会被镜头行动触发。`composeWorldPrompt()` 会把场景身份、镜头层、路线结果、固定站位群像与临时拍照动作组合为一次完整 prompt。`composePortalPrompt()` 只在显式换幕时生成 `summon / enter` 两个完整 Prompt；每段动作自带人物固定约束，因此不重复 ambient 段，并保持在约 2k character 预算内。opening anchor 以 world-space root / footprint 描述并在整个普通探索中保持；route、photo 与 portal action 互斥。拍照状态机使用本地单调 chunk serial，即使 Reactor run 内的 `chunk_index` 归零也不会提前推进。

`photoAction` 只用于少数场景的特殊覆盖。未配置时，`resolvePhotoAction()` 会根据当前 `ensemble.count` 自动生成共享的 `LOOK HERE / HOLD / SHUTTER / release` 协议，因此第二幕的五人、第三幕的六人、第四幕以及未来新增的每一幕都会默认显示并支持拍照。

当前实现把玩家定义为不可见的 observer camera，而不是任何一位画面人物。每幕所有 seed-visible performers 在拍照时都保持原身份、原站位与原姿势，没有任何一位临时成为摄影者。

当前照片保存的是简化 pose 动作确认后、无 HTML 覆盖的原始 Reactor 主视频帧。屏幕本身就是 observer camera；拍照期间不增加可见设备、第二视角或推拉镜头。

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

三段黑门换幕目前已通过类型检查、Prompt 预算断言与 production build；远门距离、实际步行速度、全黑判定以及连续四次 generation 之间的真实时序仍需要一次显式的 credit-spending canary 才能确认。

`submission/oneshot/` 是独立交付包，本应用不会读取其中内容或根目录的 `openai.key`。
