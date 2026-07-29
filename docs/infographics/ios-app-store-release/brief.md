# Infographic brief

## Audience and decision

- Audience: 独立开发者、首次负责 iOS 发版的产品经理、小型产品团队。
- Decision or use moment: 在立项和发布冲刺开始时确定关键依赖；在提审前执行 Gate 检查。
- What should change after reading: 从“代码写完再处理上架”转为“开发与商店准备并行推进，以 Gate 管理交付”。

## Governing message

5 个 Gate 串起 iOS 上线；账号、合规与审核越早前置，返工越少。

## Supporting claims

| ID | Claim / criterion | Exact evidence | Encoding | Annotation |
|---|---|---|---|---|
| C1 | 开发与 App Store 是两条并行工作流 | App record must exist before upload; production `.ipa` is independently produced | 两条水平泳道 + 顺序 | “并行准备，在上传处汇合” |
| C2 | 上传构建并不等于提交审核 | EAS Submit uploads; App Review is a later App Store Connect action | 阶段位置 + 橙色 Gate | “上传 ≠ 提审” |
| C3 | 隐私与地区合规应在开发期盘点 | Privacy answers include third-party SDKs; China requirements vary by function/category | 包含关系 + 风险注释 | “先盘点数据流，再填表” |
| C4 | 审核速度取决于可复现路径和完整信息 | Review notes/demo account required where applicable; 90% under 24h | 定量标记 + 审核里程碑 | “让审核员 3 步走通核心价值” |
| C5 | 获批仍不是最终可见状态 | manual/automatic/scheduled release; up to 24h to storefront | 最后 Gate + 终点 | “获批后发布，更新可 7 日灰度” |

## Evidence ledger

- S1
  - Claim: 使用与 App Store 工具链匹配的稳定 SDK。
  - Exact source: Expo SDK 57 targets iOS 16.4+ and Xcode 26.4+.
  - Location: https://docs.expo.dev/versions/v57.0.0/
  - Type: fact
  - Unit / period: SDK 57.0.0; retrieved 2026-07-29.
  - Caveat: Expo 和 Apple 的最低要求会继续变化。

- S2
  - Claim: 生产构建、上传和提审是三个动作。
  - Exact source: production `.ipa`; `eas build`; `eas submit`; TestFlight processing usually 10–15 minutes; production release proceeds in App Store Connect.
  - Location: https://docs.expo.dev/submit/ios/
  - Type: fact
  - Unit / period: 10–15 minutes, typical processing estimate.
  - Caveat: 处理时长是通常值，并非承诺。

- S3
  - Claim: 账号与主体类型是第一项外部依赖。
  - Exact source: Apple Developer Program costs USD 99 per membership year; organization enrollment uses D‑U‑N‑S.
  - Location: https://developer.apple.com/programs/enroll/
  - Type: fact
  - Unit / period: USD/year; current at retrieval date.
  - Caveat: local-currency price and taxes vary by region.

- S4
  - Claim: 付费应用须提前处理协议、税务和银行资料。
  - Exact source: Paid Apps Agreement plus tax and banking information; app record before upload.
  - Location: https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-workflow
  - Type: fact
  - Unit / period: current workflow.
  - Caveat: 免费应用和付费应用所需商务资料不同。

- S5
  - Claim: Bundle ID、version、build string 组成上传身份链。
  - Exact source: bundle ID and version associate upload; build string uniquely identifies build.
  - Location: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
  - Type: fact
  - Unit / period: per build.
  - Caveat: 具体自动递增方式取决于 Xcode、CI 或 EAS 配置。

- S6
  - Claim: 产品页素材是可审核 Gate 的组成部分。
  - Exact source: one to 10 screenshots and up to three app previews per localization.
  - Location: Apple screenshot specifications / App Store Connect.
  - Type: fact
  - Unit / period: count per localization.
  - Caveat: 设备尺寸和像素规范随产品线更新。

- S7
  - Claim: 隐私声明应源自真实数据流和 SDK 清单。
  - Exact source: app privacy answers include data practices of third-party partner code and require updates when practices change.
  - Location: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
  - Type: fact
  - Unit / period: app level, current version.
  - Caveat: Privacy Manifest 与 App Privacy 问卷相关但并非同一份材料。

- S8
  - Claim: 完整审核路径可降低信息往返。
  - Exact source: provide demo account/special setup/current contacts where applicable; 90% reviewed in under 24 hours.
  - Location: https://developer.apple.com/app-store/review/
  - Type: fact
  - Unit / period: percentage of submissions; average platform statistic.
  - Caveat: incomplete, complex or regulated submissions may take longer.

- S9
  - Claim: 价格、地区和发布方式决定“可售”与“可见”。
  - Exact source: choose price, tax category, regions and release mode; storefront propagation may take up to 24 hours.
  - Location: Apple publishing overview / release option.
  - Type: fact
  - Unit / period: up to 24 hours after release.
  - Caveat: storefront propagation varies.

- S10
  - Claim: 中国大陆合规按功能和类目判断。
  - Exact source: some apps need ICP filing; games, books/magazines, religion and news need additional records or permits.
  - Location: Apple App information.
  - Type: fact
  - Unit / period: current at retrieval date.
  - Caveat: regional law and platform enforcement can change.

- S11
  - Claim: 更新版本可采用七日分阶段发布。
  - Exact source: iOS phased release progresses 1%, 2%, 5%, 10%, 20%, 50%, 100% over seven days.
  - Location: Apple phased release help.
  - Type: fact
  - Unit / period: percentage of eligible automatic-update users by day.
  - Caveat: applies to updates; users may still manually download the update.

## Assumptions and gaps

- “开发完成”定义为核心用户旅程、权限异常、离线/弱网行为和真实设备测试达到发布标准。
- 图中的 Gate 是交付管理模型，是依据官方流程组织后的解释，不是 Apple 官方命名。
- 未给每个 App Review 类目列出完整规则；受监管行业需另做专项 Exhibit。
- 流程同时适用于 Xcode 和 Expo/EAS；命令仅在注释中体现 Expo 路径。

## Visual job

- Primary relationship: sequence with parallel dependencies.
- Template: roadmap.
- Evidence mode: mixed.
- Required encodings:
  - horizontal position = lifecycle order;
  - two lanes = product/build work vs App Store/compliance work;
  - connection = dependency and handoff;
  - orange = Gate, exception or decision-changing evidence;
  - navy = normal delivery path.
- Direct annotations:
  - USD 99 / year;
  - upload ≠ submit for review;
  - 1–10 screenshots / localization;
  - 90% under 24h;
  - up to 24h to storefront;
  - mainland China compliance depends on function/category.
- Decision marker: final state “可购买 + 可观测 + 可迭代”.
- Source-reference mapping: every phase cell and numeric annotation carries `data-source-ref`.

## Deliberate omissions

- No generic card wall and no exhaustive checklist.
- No private credentials, exact app contact data or signing keys.
- No Android or enterprise distribution.
- No unsupported “success rate” or invented duration for development and enrollment.
- No decorative device mockup; the process relationship is the hero.

## Human review

- [x] Five-second read reproduces the title’s claim.
- [x] Both lanes and all five Gate handoffs are traceable without reading paragraphs.
- [x] Orange has one meaning: Gate / exception / decisive evidence.
- [x] Numeric marks show units and caveats.
- [x] Full-size and thumbnail views retain hierarchy and legibility.

Review evidence:

- Full-size 3200 × 1800: six phase headers, two aligned work lanes, five Gate
  outcomes, four decision-changing metrics and all direct annotations remain
  inside their regions with no clipping or overlap.
- Thumbnail 800 × 450: the action title, left-to-right phase sequence, orange
  Gate semantics, navy final state and Ship Check band remain distinguishable
  before reading body copy.
