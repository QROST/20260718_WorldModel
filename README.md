# Fashion Maze × Reactor

一个面向 SIGGRAPH hackathon 的 HTML/React 实时世界体验：用户从真实团队 rose-garden 入口图进入由 Reactor LingBot World 2 生成的连续视频世界，并通过世界变体选择、WASD 与视角控制探索会实时变化的 fashion maze。

## 当前体验

- 三张来自团队 dataset 的 1376×768 rose-garden entrance；服务端在每次打开页面时随机选择一张，单次页面与 Reactor session 始终锁定同一张图片和对应 opening prompt；
- 同一组五位从首帧就存在的 white-and-cobalt couture performers；所有人物保持各自 opening mark，以及 seed 中每条腿与脚原有的位置、高度、角度和接触状态，以长时间 runway hold、低频眨眼、几乎不可见的呼吸与极小目光变化维持稳重的 fashion-show tableau；不换脚、不转移重心、不原地踏步，也不被镜头移动驱动；
- 入口只保留 `THE INVITATION`、小字 narrative 和单一 `Start live maze` 主操作，不显示抢占画面的 entrance 大标题；
- Neon Canopy、Living Runway、Golden Circuit 的 route / Prompt 定义继续保留为内部素材，但公共体验不再显示 `Worlds Ahead` 三按钮；
- 第一幕提供 `ENTER THE BLACK DOOR`：模型先在当前镜头正前方的中远距离生成带微弱冷色轮廓光的实体黑色 door-gate，并用两个完整 chunks 让门稳定保持；镜头不再转向，而是沿当前 forward axis 用三个已确认的真实 `forward` chunks 缓慢直走。随后网页用 2.6 秒居中推进把同一扇门的黑色内部扩展到全屏，固定黑幕完全覆盖后才 reset；
- 黑幕完全覆盖后，应用在同一 Reactor 连接中执行 `reset → setSeed → setImage → setPrompt → start`，启动 `CHAPTER 02 · The Cyberpunk Garden`。服务端会从 `/dataset/cyberpunk-garden/scene2.png`、`scene3b.png`、`scene5.png` 中随机锁定一张；转场中不会再次跳图；
- 第二幕保留三张 seed 共同的五位黑色 couture 人物与赛博 portal atrium，每个 variant 用独立 opening anchor 忠实描述原图中的站位、支撑腿、悬空脚、跪姿以及举起、外展或低垂的手臂。Prompt 不再用“全员低手位”与现有图片对抗；如需统一低手位，必须先更换对应 seed。新 Prompt chunk 与连续可见帧都确认后，黑幕才用 1.1 秒渐隐；
- 第二幕提供 `ENTER THE NEXT BLACK DOOR`，复用相同的正前方远门、缓慢直行、完整入门与黑场 reset 流程，目标是独立注册的 `CHAPTER 03`；第二幕没有 route，但会自动使用共享拍照流程，WASD 与视角控制仍可使用；
- 第三幕是 `The Asian Sculpture Garden`，使用 `/dataset/asian-sculpture-garden/grand-finale.png`：六位银白 couture 人物保持各自固定站位与 seed 姿势；S04 的举臂和 S05 的展开双臂被定义为已经完成的静止轮廓，禁止挥动、重复或引发模仿。共享拍照流程会按 `ensemble.count = 6` 指挥全部六人；
- 第三幕提供第三个 `ENTER THE NEXT BLACK DOOR`，目标是独立注册的 `CHAPTER 04 · The Afro-Futurist Prism`；
- 第四幕从 `/dataset/afro-futurism/scene-01.png`、`scene-02.png`、`scene-03.png` 中独立随机锁定一张。三张 seed 分别保留 5 / 7 / 5 位 metallic couture performers；每个 variant 的人数会覆盖场景默认人数，因此共享拍照流程会准确指挥当前图中的全部人物；
- 第四幕同样提供拍照和 `ENTER THE NEXT BLACK DOOR`，经相同黑门流程进入 `CHAPTER 05 · The Afro-Futurist Continuum`；第五幕从独立的 `/dataset/scenes/chapter-05/scene-01..03.png` 随机选择，人数同样为 5 / 7 / 5。文件目前与第四幕素材一致，但路径和 seed 独立，之后可以单独覆盖；
- 第六幕从 `/dataset/scenes/chapter-06/scene-01..06.png` 随机选择银色雕塑花园，人数为 6 / 6 / 5 / 6 / 6 / 6；第七幕从 `/dataset/scenes/chapter-07/scene-01..05.png` 随机选择铜橙色圆环工厂，人数为 6 / 6 / 5 / 5 / 6；
- 第五至七幕由同一个 `createReplaceableChapter()` 生成，并共享完全相同的 `base / anchor / destination / movement` Prompt。单张素材配置只有 `id / path / seed / ensembleCount`，换图时无需重写场景描述；第七幕是当前终幕；
- 静态预览不再承担 world selector 功能，用户从邀请故事直接进入 live maze；
- Prompt 以可检查的 `base / anchor / camera / movement / destination / event / continuity` segments 组织；普通探索使用一条 input-gated observer-invariant camera contract，WASD、方向键与鼠标不会因按下或松开而制造延迟一个 chunk 的 Prompt 竞态；拍照与黑门分别选择 compact `locked / forward` layer versions；
- 用户点击 `ENTER LIVE MAZE` 后才连接 Reactor；
- 首次连接只在 observable `status === ready` 后上传参考图；`conditions_ready` 与权威 `state.has_image / has_prompt` 任一路径确认双条件后，以 once-only gate 触发 generation；
- seed 不会在黑色占位 track 刚出现时消失；generation 启动后，只有 track live/unmuted、视频播放中且连续两帧通过非黑像素检查才交叉淡出。20 秒仍无可见帧会自动断开保护 credits；
- 变体选择同时发送 hot-swapped prompt 与一段单-chunk 前进指令；确认生效后自动回到 idle 与 settled prompt；入口 seed 没有虚构的三岔口；
- 每一幕默认都有 `TAKE PHOTO` 与快捷键 `C`，并共享同一段短暂通用流程：`LOOK HERE → HOLD → SHUTTER`，三个 beat 各保持一个已确认的 Prompt chunk。流程根据当前 scene 的 `ensemble.count` 描述全部 seed-visible performers，不包含 `M01–M05`、固定人数、服装或场景名称；第二幕及其后所有当前与未来 Chapter 都无需复制拍照配置。人物只做最小幅度的眼神、头部和必要时的肩部转动；无人物场景则固定环境构图；
- `SHUTTER` Prompt 只描述完成姿势的稳定可见状态，真正的截帧完全由网页完成。确认后应用从原始 Reactor video frame 保存 PNG，自动尝试下载，并保留带缩略图的 `PHOTO SAVED / DOWNLOAD` 回执；随后一个 release chunk 让当前 subjects 放松目光，再等待一个真实 ambient Prompt chunk 才解锁控制。每一拍有独立的 30 秒 watchdog，恢复失败会自动断开保护 credits；
- WASD 只控制观察者镜头的前后与横移，方向键只控制镜头视角；没有任何人物会跟随输入移动、转身或追踪镜头。`MOUSE LOOK` 使用原生 `setCameraPose()` 与 video chunk 时钟；
- `OPERATOR` 抽屉显示 session、chunk、action、track、camera pose、首个稳定 ambient chunk，以及最终 Prompt 的逐 segment 文本和字符预算；
- 录制可用时，operator 可截取最近 10 秒，预览并下载 MP4；
- `keyup`、窗口失焦和页面隐藏都会归零控制状态；
- `END SESSION` 使用 non-recoverable disconnect；输入归零只会等待最多 750ms，不能阻塞释放 session；
- 每个可见场景使用醒目的 `30 → 0` 剩余秒数倒计时；最后 10 秒进入警示色、最后 5 秒加快脉冲。前六幕到时会在当前拍照、route 或暂停动作结束且控制恢复后打开黑门问答，切换完成后重置为 `30`；没有下一幕的第七幕到时会直接断开并释放 session；
- connection-ready、入口 arming 与 start 各有独立 watchdog；事件迟迟未确认时会断开 session 保护 credits；
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
    ensembleCount?: number; // optional per-image performer count
  }>;
  characterImage?: string;
  seed: number;
  entrance: NarrativeBeat;
  basePrompt: string;
  defaultDestinationPrompt: string;
  promptLayers: {
    movement: string; // subject behavior only
  };
  ensemble: {
    count: number;
    members: Array<{
      id: string;
      name: string;
      referenceImage?: string;
      identityPrompt: string;
    }>;
  };
  photoAction?: { // optional scene-specific override
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
    question: {
      prompt: string;
      choices: [{ id: string; label: string }, { id: string; label: string }];
    };
    portal: { summon: string; enter: string };
  };
  routes: MazeRoute[];
}
```

新增图片时放进 `public/dataset/`。第一幕位于 `rose-garden/`，第二幕位于 `cyberpunk-garden/`，第三幕位于 `asian-sculpture-garden/`，第四幕位于 `afro-futurism/`；第五至七幕使用稳定接口 `scenes/chapter-XX/scene-YY.png`。前三个可替换 Chapter 的单图 metadata 只包含 `id / label / seedImage / seed / ensembleCount`，通用工厂补齐共享 Prompt。正式 seed 建议使用 16:9 PNG、JPEG 或 WebP。随机选择发生在动态 Server Component，它会一次性为七个 Chapter 分别选定 variant id 并传给客户端，因此不会产生 hydration mismatch，也不会在黑门转场中再次换 seed；即使第四、第五幕当前图像相同，两幕也会独立抽签。

每条 `route` 同时包含观众看到的 narrative 和模型看到的 `promptDelta.transition / settled`。选择变体时，首个 forward chunk 使用一次性 transition；chunk 完成后立即换成没有生长、出现或攀爬过程动词的 settled Prompt。普通 WASD、方向键与鼠标只发送 SDK 原生 camera input；普通探索的 camera segment 同时明确“idle 时静止、held input 时才运动”，避免 `setPrompt()` 的 next-chunk 延迟与实时输入竞态。`composeWorldPromptSegments()` / `composePortalPromptSegments()` 是唯一的分层真源，字符串 composer 只负责单空格拼接。黑门使用 compact layer version：Reactor 用 2 个 chunks 固定黑门，再用 3 个已验证为 forward 的 chunks 稳步接近；随后网页对当前视频执行 2.6 秒居中推进，并在固定黑幕下 reset 到下一幕。opening anchor 始终作为 world-space mark 携带；route、photo 与 portal action 互斥。拍照状态机使用本地单调 chunk serial，即使 Reactor run 内的 `chunk_index` 归零也不会提前推进。

六道黑门分别围绕相邻两幕的视觉边界提问：玫瑰与电光、信号与纪念碑、雕塑与未来、棱镜与延续、霓虹与花园、自然与锻造终章。六个问题、十二个选项文案和十二个 choice ID 全局唯一。手动点击黑门或 30 秒自动到点都会进入同一个 `pausing → choosing → preparing → resuming` 决策状态机：立即释放镜头输入并冻结本幕倒计时，收到 Reactor pause 确认后才开放两个答案；选择后在暂停状态预设黑门 Prompt，resume 的第一个生成 chunk 直接进入原有黑门流程。问答期间不会发送环境 Prompt，普通暂停按钮也会锁定；弹窗明确提示 session 暂停期间仍在计费，并始终提供 End Session。

`photoAction` 只用于少数场景的特殊覆盖。未配置时，`resolvePhotoAction()` 会根据当前 variant 的 `ensemble.count` 自动生成共享的 `LOOK HERE / HOLD / SHUTTER / release` 协议；第五幕为 5 / 7 / 5 人，第六幕为 6 / 6 / 5 / 6 / 6 / 6 人，第七幕为 6 / 6 / 5 / 5 / 6 人，全部默认支持拍照。

当前实现把玩家定义为不可见的 observer camera，而不是任何一位画面人物。每幕所有 seed-visible performers 在拍照时都保持原身份、原站位与原姿势，没有任何一位临时成为摄影者。

当前照片保存的是简化 pose 动作确认后、无 HTML 覆盖的原始 Reactor 主视频帧。屏幕本身就是 observer camera；拍照使用 locked camera layer，Prompt 不再命令模型“拍一张照片”。

## Prompt 设计准则

本项目按 Reactor 的 [LingBot World 2 Prompt Guide](https://docs.reactor.inc/model-api-reference/lingbot-world-2/prompt-guide) 与 [`reactor-team/js-sdk` 官方 layered composer](https://github.com/reactor-team/js-sdk/blob/c67c276ec61f8d5221797dde36eea24b494b04fe/examples/lingbot-world-2/lib/lingbot-world-prompts.ts) 重构：

- `base` 限于 1–3 句 subject + environment + style；人物只完整 casting 一次，不含 POV、输入、镜头或动作纠正句；
- `anchor` 忠实描述当前 seed 的已完成姿势。图片与文字冲突时 image 会占优并产生伪影，因此改变姿势目标必须先改变 seed，而不是追加否定句；
- camera、movement、destination 与 event 各自只拥有一个轴；大型 photo / portal event 选择 compact layer version，为事件细节留预算；
- 默认描述画面中存在的正面事实；camera contract 和一个具体歧义 guard 才使用必要的否定语言；
- action 必须短暂、可构图并落在稳定状态；fresh session 至少确认一个 `active_prompt` 匹配且 `active_action === "still"` 的完整 ambient chunk，才开放控制与拍照；
- 总 Prompt 以 1800 characters 为安全目标、2000 为 hard cap；`base ≤ 600`、`camera ≤ 300`、`movement ≤ 350`、单个 `event ≤ 500`。Operator 会展示每个 segment 的来源与长度。

## Reactor 架构

- `@reactor-team/js-sdk@2.12.1`
- `@reactor-models/lingbot-world-2@0.3.3`
- 模型：`reactor/lingbot-world-2`
- 输出 track：`main_video`
- Token broker：`app/api/reactor/token/route.ts`
- React/session/controller：`components/FashionMazeExperience.tsx`

官方模板中吸收了 layered prompt composition、layer version、纯函数 segment composer、next-chunk Prompt state、chunk-driven native camera pose、base-SDK session clip 与 operator telemetry。通用案例库、完整 layered editor、jump/crouch/orbit 控制和第二套 token route 没有进入产品代码，避免维护两套应用。

`pause()` 只暂停生成，不释放 GPU，也不会停止计费。真正结束体验必须点击 `END SESSION` 或调用默认的 `disconnect()`。

### 部署安全边界

当前 token broker 面向本机或受控的 hackathon operator 网络，没有登录与分布式限流。不要直接把它暴露成公开网站；公开部署前应在 hosting / reverse proxy 层加入 operator authentication 和 rate limit。根目录的 `reactor.key`、`openai.key` 虽然是 `0600` 且被 `*.key` 忽略，但手工 zip 或上传整个文件夹时仍必须显式排除。正式部署只使用平台 secret `REACTOR_API_KEY`。

## 验证

```bash
npm run typecheck
npm run verify:prompts
npm run build
```

`verify:prompts` 不连接 Reactor，也不花费 credits；`prebuild` 会自动先运行它。它穷举所有 scene × entrance variant × route × photo beat × portal stage，检查七幕链无环且全部可达、唯一终幕、seed 文件存在、问题/选项/choice ID 全局不重复、ID/transition 完整性、seed anchor、layer ownership、photo shutter 语义、分层字符预算与最终拼接一致性。当前矩阵覆盖 7 幕、24 个入口变体、230 个完整 Prompt packets；最长组合为 1797 / 2000 characters。

不要在自动测试中点击 live 入口；真实连接测试应作为显式的 credit-spending canary 单独执行。Prompt 或 seed 修订必须从 fresh session 评估，旧坏帧进入自回归历史后继续 hot-swap 不能证明修复有效。

六段黑门换幕目前已通过类型检查与全量 Prompt 预算矩阵；实际门距、三段 forward 的步行速度、网页推进观感以及连续七次 generation 的真实时序仍需要一次显式的 credit-spending canary 才能确认。

`submission/oneshot/` 是独立交付包，本应用不会读取其中内容或根目录的 `openai.key`。
