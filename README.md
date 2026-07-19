# Fashion Maze × Reactor

一个面向 SIGGRAPH hackathon 的 HTML/React 实时世界体验：用户从真实团队 rose-garden 入口图进入由 Reactor LingBot World 2 生成的连续视频世界，并通过世界变体选择、WASD 与视角控制探索会实时变化的 fashion maze。

## 当前体验

- 三张来自团队 dataset 的 1376×768 rose-garden entrance；服务端在每次打开页面时随机选择一张，单次页面与 Reactor session 始终锁定同一张图片和对应 opening prompt；
- 同一组五位从首帧就存在的 white-and-cobalt couture performers；所有人物保持各自 opening mark，以及 seed 中每条腿与脚原有的位置、高度、角度和接触状态，以长时间 runway hold、低频眨眼、几乎不可见的呼吸与极小目光变化维持稳重的 fashion-show tableau；不换脚、不转移重心、不原地踏步，也不被镜头移动驱动；
- 入口只保留 `THE INVITATION`、小字 narrative 和单一 `Start live maze` 主操作，不显示抢占画面的 entrance 大标题；
- Neon Canopy、Living Runway、Golden Circuit 的 route / Prompt 定义继续保留为内部素材，但公共体验不再显示 `Worlds Ahead` 三按钮；
- 第一幕提供 `ENTER THE BLACK DOOR`：模型优先把中远处已有的拱或门洞原位变成与本幕材料、支撑和轮廓一致的单一 `ornamental` 哑黑门；没有合适开口时才从相邻建筑一体延伸，绝不生成游离的工业门框。门用 3 个完整 chunks 稳定后，镜头沿 forward axis 用 8 个已确认的真实 `forward` chunks 直走并在最后 2 个 chunks 穿过门槛、完整进入黑色内部。网页只补一个 1.8 秒、最大 1.1× 的轻微推进，随后由固定黑幕完全覆盖再 reset；
- 每次点击 Start 都抽取一个 32 位 run-order seed：rose garden 始终是 Scene 1，其余六个 authored scene 使用无重复 Fisher–Yates 顺序固定本局 Scene 2–7；断线重开才会重新抽取；
- authored scene 包括 Cyberpunk Garden、两组 Asian Sculpture Garden、两组 Afro-Futurism 与 Asian Fusion；各 scene 仍从自己的入口素材中随机锁定一张，并以 per-image `ensembleCount` 指挥 seed-visible performers；
- 本局七个 authored scene 各使用一道与目标场景无关、互不重复的位置型门问答，因此随机顺序不会把问题文案与下一张图错误绑定；所有场景复用同一套环境开口优先的 ornamental 黑门、分段直行、完整入门与黑场 reset 流程；
- 第七个 authored scene 的黑门完成后先释放 Reactor session，再把本局实际使用的七张 allowlisted seed 图提交给服务端；服务端以 `gpt-image-2` Images Edit 生成 runtime-only `SCENE 08 · The Grand Palais`，等待期间轮播故事文案；
- Scene 8 显示生成图与 `Attend the show`，点击后用该图重新启动 Reactor，并继续共享通用拍照、WASD、视角、倒计时与 session tools；
- 静态预览不再承担 world selector 功能，用户从邀请故事直接进入 live maze；
- Prompt 以可检查的 `base / anchor / camera / movement / destination / event / continuity` segments 组织；普通探索使用一条 input-gated observer-invariant camera contract，WASD、方向键与鼠标不会因按下或松开而制造延迟一个 chunk 的 Prompt 竞态；拍照与黑门分别选择 compact `locked / forward` layer versions；
- 用户点击 `ENTER LIVE MAZE` 后才连接 Reactor；
- 首次连接只在 observable `status === ready` 后上传参考图；`conditions_ready` 与权威 `state.has_image / has_prompt` 任一路径确认双条件后，以 once-only gate 触发 generation；
- seed 不会在黑色占位 track 刚出现时消失；generation 启动后，只有 track live/unmuted、视频播放中且连续两帧通过非黑像素检查才交叉淡出。当前 hackathon 模式不会因可见帧等待过久而自动断开；
- 变体选择同时发送 hot-swapped prompt 与一段单-chunk 前进指令；确认生效后自动回到 idle 与 settled prompt；入口 seed 没有虚构的三岔口；
- 每一幕默认都有 `TAKE PHOTO` 与快捷键 `C`，并共享同一段通用流程：`LOOK HERE → HOLD → SHUTTER`。人物场景使用 `2 / 3 / 2` 个已确认的 Prompt chunks：先完成面部、头部和必要的轻微肩部转向，再稳定姿势，最后保持快门构图；每个 beat 都用紧凑、自包含的正面状态要求全部人物正脸、睁眼并直视当前 first-person camera lens，而不是回指上一个 beat 的抽象 `gaze`。流程根据当前 scene 的 `ensemble.count` 描述全部 seed-visible performers，不包含 `M01–M05`、固定人数、服装或场景名称。第二幕及其后所有当前与未来 Chapter 都无需复制拍照配置；无人物场景仍使用三段单-chunk 环境构图；
- `SHUTTER` Prompt 只描述完成姿势的稳定可见状态，真正的截帧完全由网页完成。`chunk_complete` 后应用继续等待 1.2 秒已实际呈现的 Reactor media time，避免把已发出但尚未播放到浏览器的旧帧保存为照片；支持 frame callback 的浏览器按 media time 栅栏，fallback 在浏览器提供 playback-quality counter 时同时验证已呈现帧数，否则以 `currentTime` 做 best-effort，两条路径都在 5 秒内 fail closed。随后从无 HTML 覆盖的原始主视频帧优先保存 WebP（浏览器不支持时回退 PNG）、自动尝试下载并显示回执。一个 release chunk 让当前 subjects 放松目光，再等待一个真实 ambient Prompt chunk 才解锁控制。Reactor Prompt/chunk 确认没有应用层等待上限；
- WASD 只控制观察者镜头的前后与横移，方向键只控制镜头视角；没有任何人物会跟随输入移动、转身或追踪镜头。`MOUSE LOOK` 使用原生 `setCameraPose()` 与 video chunk 时钟；
- `Session tools` 抽屉显示 session、chunk、action、track、camera pose、计时器 gate 与最终 Prompt 预算；其中默认折叠的 `Debug event log` 保留最近 250 条 lifecycle 事件，可复制 JSONL 或手动清空；实现会遮蔽常见 JWT、Bearer、API-key、blob URL 与本机路径格式，但仍应在对外分享前人工检查；
- 录制可用时，operator 可截取最近 10 秒，预览并下载 MP4；
- `keyup`、窗口失焦和页面隐藏都会归零控制状态；
- `END SESSION` 使用 non-recoverable disconnect；输入归零最多等待 750ms，disconnect confirmation 最多等待 10 秒；若 SDK 未确认断线，界面会明确警告 session 可能仍在运行，并阻止 Scene 8 付费请求继续；
- 每个可见场景使用醒目的 `30 → 0` 剩余秒数倒计时；最后 10 秒进入警示色、最后 5 秒加快脉冲。本局七个 authored scene 到时会在当前拍照、route 或暂停动作结束且控制恢复后打开黑门问答；第七次问答进入生成 finale。没有下一幕的 Scene 8 到达 `0` 后继续保持 live，直到用户主动 `END SESSION`；
- 当前为 unbounded-wait hackathon policy：connection-ready、入口 arming、start、route、拍照、门问答与跨幕生成都可以无限等待，不会因应用层 watchdog 自动断开；黑幕等待下一幕时仍提供可见的 `END SESSION`；明确的 SDK/API command error 仍会结束无法可靠恢复的 session；
- 群像的“暂停”是 prompt-held pose，live generation 与计费仍继续；SDK `pause()` 在界面中明确写作 `FREEZE STREAM · STILL BILLED`；
- 页面明确区分 `STATIC PREVIEW`、`LIVE` 和 `PAUSED · STILL BILLED`。

## 安装与运行

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000`。静态预览不会请求 JWT，也不会创建 Reactor session。

### 演示脚本

仓库根目录提供四个无需记忆参数的入口：

```bash
./setup-demo.sh  # 安装 lockfile 固定的依赖
./build-demo.sh  # 同步依赖、类型检查、全部离线验证与 production build
./start-demo.sh  # 启动 loopback-only production 演示
./start-dev.sh   # 启动 loopback-only development server
```

从干净 clone 直接运行 `./start-demo.sh` 也可以；缺少依赖或 production build 时，它会自动准备。正式演示建议提前运行 `./setup-demo.sh` 与 `./build-demo.sh`，现场只运行 `./start-demo.sh`。首次安装需要访问 package registry；构建与启动均使用 lockfile 固定的依赖。所有脚本都不会输出、创建或复制 API key，也不会在安装或构建阶段连接 Reactor / OpenAI。若已开始 live Reactor session，停止本地服务器前仍应先在页面点击 `End Session`。

应用优先读取服务端环境变量：

```bash
REACTOR_API_KEY=<your-reactor-api-key>
OPENAI_API_KEY=<your-openai-api-key>
```

本地 hackathon 开发也可分别使用根目录的 `reactor.key` 与 `openai.key`。所有 `*.key` 文件均被 Git 忽略；Reactor key 不会进入浏览器，浏览器只从 `POST /api/reactor/token` 获得十分钟有效的短期 JWT；OpenAI key 只由 Scene 8 服务端 route 读取。

## 内容包与 narrative

当前内容从原始 Fashion Maze authoring 仓库以只读方式吸收。可携带的原始 spec 与 14-scene registry 位于 [`content/authoring/`](./content/authoring/)，实际运行的入口图和角色图位于 [`public/dataset/`](./public/dataset/)，映射决策记录在 [`content/README.md`](./content/README.md)。运行时内容集中在 [`lib/fashion-maze.ts`](./lib/fashion-maze.ts)。每个 maze 的结构为：

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
    ensembleCount?: number | "all"; // exact count, or every generated performer
  }>;
  seed: number;
  entrance: NarrativeBeat;
  basePrompt: string;
  defaultDestinationPrompt: string;
  promptLayers: {
    movement: string; // subject behavior only
  };
  ensemble: {
    count: number | "all";
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
    buttonLabel: string;
    portal: { summon: string; enter: string };
  };
  routes: MazeRoute[];
}
```

新增图片时放进 `public/dataset/` 并运行 `pnpm optimize:images`。第一幕位于 `rose-garden/`，第二幕位于 `cyberpunk-garden/`，第三幕位于 `asian-sculpture-garden/`，第四幕位于 `afro-futurism/`；第五至七幕使用稳定接口 `scenes/chapter-XX/scene-YY.webp`。前三个可替换 Chapter 的单图 metadata 只包含 `id / label / seedImage / seed / ensembleCount`，通用工厂补齐共享 Prompt。源图可使用 16:9 PNG，提交前统一转换为 WebP q90。随机选择发生在动态 Server Component，它会一次性为七个 Chapter 分别选定 variant id 并传给客户端，因此不会产生 hydration mismatch，也不会在黑门转场中再次换 seed；即使第四、第五幕当前图像相同，两幕也会独立抽签。

每条 `route` 同时包含观众看到的 narrative 和模型看到的 `promptDelta.transition / settled`。选择变体时，首个 forward chunk 使用一次性 transition；chunk 完成后立即换成没有生长、出现或攀爬过程动词的 settled Prompt。普通 WASD、方向键与鼠标只发送 SDK 原生 camera input；普通探索的 camera segment 同时明确“idle 时静止、held input 时才运动”，避免 `setPrompt()` 的 next-chunk 延迟与实时输入竞态。`composeWorldPromptSegments()` / `composePortalPromptSegments()` 是唯一的分层真源，字符串 composer 只负责单空格拼接。黑门使用 compact layer version：Reactor 用 3 个 chunks 让环境既有拱或门洞完成 ornamental 黑化并稳定，再用 8 个同时匹配 `forward` action 与 portal Prompt 的 chunks 走近、越过门槛并完整进入；客户端末段只做最大 1.1× 的轻微推进，真正黑场由门内画面与固定 curtain 完成。opening anchor 始终作为 world-space mark 携带；route、photo 与 portal action 互斥。拍照状态机使用本地单调 chunk serial，即使 Reactor run 内的 `chunk_index` 归零也不会提前推进。

七道黑门各使用一道与目标场景无关的问题，因此随机幕序不会让文案与下一张 seed 错配；七个问题、十四个选项文案和十四个 choice ID 全局唯一。手动点击黑门或 30 秒自动到点都会进入同一个 `pausing → choosing → preparing → resuming` 决策状态机：立即释放镜头输入并冻结本幕倒计时，收到 Reactor pause 确认后才开放两个答案；选择后在暂停状态预设黑门 Prompt，resume 的第一个生成 chunk 直接进入原有黑门流程。问答期间不会发送环境 Prompt，普通暂停按钮也会锁定；弹窗明确提示 session 暂停期间仍在计费，并始终提供 End Session。第七次决策结束 authored journey，并进入 runtime-only Grand Palais finale 的生成流程。

`photoAction` 只用于少数场景的特殊覆盖。未配置时，`resolvePhotoAction()` 会根据当前 variant 的 `ensemble.count` 自动生成共享的 `LOOK HERE / HOLD / SHUTTER / release` 协议；第五幕为 5 / 7 / 5 人，第六幕为 6 / 6 / 5 / 6 / 6 / 6 人，第七幕为 6 / 6 / 5 / 5 / 6 人，全部默认支持拍照。

当前实现把玩家定义为不可见的 observer camera，而不是任何一位画面人物。每幕所有 seed-visible performers 在拍照时都保持原身份、原站位与原姿势，没有任何一位临时成为摄影者。

当前照片保存的是简化 pose 动作确认后、无 HTML 覆盖的原始 Reactor 主视频帧。屏幕本身就是 observer camera；拍照使用 locked camera layer，Prompt 不再命令模型“拍一张照片”。

## Prompt 设计准则

本项目按 Reactor 的 [LingBot World 2 Prompt Guide](https://docs.reactor.inc/model-api-reference/lingbot-world-2/prompt-guide)、[`reactor-team/js-sdk` 官方 layered composer](https://github.com/reactor-team/js-sdk/blob/c67c276ec61f8d5221797dde36eea24b494b04fe/examples/lingbot-world-2/lib/lingbot-world-prompts.ts) 与 [LingBot World 2 extension skill](https://github.com/reactor-team/js-sdk/blob/c67c276ec61f8d5221797dde36eea24b494b04fe/examples/lingbot-world-2/skill/SKILL.md) 重构：

- `base` 限于 1–3 句 subject + environment + style；人物只完整 casting 一次，不含 POV、输入、镜头或动作纠正句；
- `anchor` 忠实描述当前 seed 的已完成姿势。图片与文字冲突时 image 会占优并产生伪影，因此改变姿势目标必须先改变 seed，而不是追加否定句；
- camera、movement、destination 与 event 各自只拥有一个轴；大型 photo / portal event 选择 compact layer version，为事件细节留预算；
- portal event 保持为一条描述环境的现在进行时句子；镜头 framing、chunk 数与无 lens zoom 的穿门动作只属于 camera layer，使文字始终与真实 `forward` 状态同步；
- 默认描述画面中存在的正面事实；camera contract 和一个具体歧义 guard 才使用必要的否定语言；
- action 必须短暂、可构图并落在稳定状态；fresh session 至少确认一个 `active_prompt` 匹配且 `active_action === "still"` 的完整 ambient chunk，才开放控制与拍照；
- 总 Prompt 以 1800 characters 为安全目标、2000 为 hard cap；`base ≤ 600`、`anchor ≤ 450`、`camera ≤ 300`、`movement ≤ 350`、`destination ≤ 300`、单个 `event ≤ 500`、`continuity ≤ 180`。Operator 会展示每个 segment 的来源与长度。

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

当前 token broker 与 Grand Palais generation route 面向本机或受控的 hackathon operator 网络，没有登录与分布式限流。Scene 8 只有浏览器 single-flight、进程内 single-flight/短 cooldown 与 same-origin 检查，这些都不能替代身份验证。不要直接把应用暴露成公开网站；公开部署前应在 hosting / reverse proxy 层加入 operator authentication、分布式 rate limit 与 quota。根目录的 `reactor.key`、`openai.key` 虽然是 `0600` 且被 `*.key` 忽略，但手工 zip 或上传整个文件夹时仍必须显式排除。正式部署只使用平台 secrets `REACTOR_API_KEY` 与 `OPENAI_API_KEY`。

## 验证

```bash
pnpm typecheck
pnpm verify:prompts
pnpm verify:startup
pnpm verify:reconnect
pnpm verify:finale
pnpm verify:controls
pnpm verify:photo
pnpm verify:scene
pnpm verify:door
pnpm build
```

八个 `verify:*` 都不连接 Reactor 或 OpenAI，也不花费 credits；`prebuild` 会自动运行全部验证。Prompt suite 穷举 authored scene × entrance variant × route × photo beat × portal stage，检查随机顺序、七道门问答、seed 文件、ID、anchor、layer ownership、photo shutter 语义与字符预算；当前矩阵覆盖 7 个 authored scenes、24 个入口变体、240 个完整 Prompt packets，最长组合为 1776 / 2000 characters。Startup 与 reconnect suite 覆盖 disconnect edge、once-only gate、debug redaction 和重连决策；controls、photo、scene 与 door suite 分别验证输入仲裁、拍照恢复、换幕状态机和门问答/重连门禁；finale suite 覆盖七张 allowlisted references、十条等待文案、single-flight guard 与 runtime Scene 8，不发真实 API 请求。

不要在自动测试中点击 live 入口；真实连接测试应作为显式的 credit-spending canary 单独执行。Prompt 或 seed 修订必须从 fresh session 评估，旧坏帧进入自回归历史后继续 hot-swap 不能证明修复有效。

七次 authored-scene 黑门决策与生成 Scene 8 的静态状态机已通过类型检查和离线矩阵；实际门距、8 个 forward 确认 chunks 的步行速度、网页推进观感、连续 Reactor generations 与一次 OpenAI Images Edit 的真实时序仍需要显式的 credit-spending canary 才能确认。

`submission/oneshot/` 是独立交付包，本应用不会读取其中内容；本地 Scene 8 route 会读取根目录的 `openai.key` 作为 `OPENAI_API_KEY` 的 fallback。
