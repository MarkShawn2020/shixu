# Source

## Exact user request

> `$lovstudio-professional-infographic iOS app 从开发到app store上线全流程 / tips / 最佳实践`

## Scope

- Audience: 独立开发者、首次负责 iOS 发版的产品经理或小团队。
- Use moment: 项目立项、进入发布冲刺、准备 App Review 三个时点。
- Governing question: 哪些依赖真正决定 App 能否从“代码可运行”走到“商店可购买”？
- Evidence mode: mixed。流程与最佳实践为定性证据；会员费用、截图数量、审核与发布时长为定量证据。
- Current operating context: Expo SDK 57 + EAS 是本次实战路径；图中同时保留 Xcode 原生项目的通用入口。
- Retrieval date: 2026-07-29。

## Primary evidence

### S1 — Expo SDK 57 compatibility

- Source: Expo SDK reference, version 57.0.0.
- URL: https://docs.expo.dev/versions/v57.0.0/
- Evidence: Expo SDK 57 targets React Native 0.86 / React 19.2.3, iOS 16.4+ and Xcode 26.4+.
- Use: release configuration must match the exact SDK and current App Store toolchain.

### S2 — EAS production build and upload

- Source: Expo, “Submit to the Apple App Store with EAS Submit”.
- URL: https://docs.expo.dev/submit/ios/
- Evidence: a production `.ipa` is required; `eas build --platform ios --profile production` creates it; `eas submit --platform ios` uploads it. The uploaded build usually appears in TestFlight after 10–15 minutes of processing. App Review is a later App Store Connect action.
- Use: prove the “upload ≠ submit for review” annotation.

### S3 — Apple Developer Program

- Source: Apple Developer, “Become a member”.
- URL: https://developer.apple.com/programs/enroll/
- Evidence: membership is USD 99 per membership year, with regional pricing differences; organization enrollment requires legal authority and a D‑U‑N‑S Number.
- Use: quantify the account gate and distinguish individual vs organization setup.

### S4 — App Store Connect workflow and paid apps

- Source: Apple, “App Store Connect workflow”.
- URL: https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-workflow
- Evidence: the Account Holder accepts agreements; paid apps require the Paid Apps Agreement plus tax and banking information; an app record must exist before a build is uploaded.
- Use: place agreements, tax, banking and app record before the upload gate.

### S5 — Build identity

- Source: Apple, “Upload builds”.
- URL: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- Evidence: Apple associates an upload with an app and version through bundle ID and version; build string uniquely identifies the build.
- Use: support early Bundle ID locking and monotonic build-number practice.

### S6 — Product page media

- Source: Apple, “Screenshot specifications” and “App Store Connect”.
- URLs:
  - https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
  - https://developer.apple.com/app-store-connect/
- Evidence: each localization accepts one to 10 screenshots and up to three previews; highest-resolution screenshots can scale to smaller device sizes.
- Use: quantify the product-page asset milestone.

### S7 — App privacy

- Source: Apple, “Manage app privacy”.
- URL: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Evidence: every iOS app needs a privacy-policy URL and App Store Connect data-practice answers; answers must include third-party partner code and stay current.
- Use: show privacy as a build-time inventory, not a last-minute form.

### S8 — Review readiness and duration

- Source: Apple, “App Review”.
- URL: https://developer.apple.com/app-store/review/
- Evidence: review information should include valid demo credentials, special setup and current contact information where applicable; on average, 90% of submissions are reviewed in under 24 hours.
- Use: quantify the review stage and attach reviewer-path best practice.

### S9 — Pricing, regions and release

- Sources:
  - https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/overview-of-publishing-your-app-on-the-app-store
  - https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/select-an-app-store-version-release-option/
- Evidence: the developer chooses build, price, tax category, regions and manual/automatic/scheduled release; approval-to-storefront visibility can take up to 24 hours.
- Use: support the sellable and live gates.

### S10 — Region-specific compliance

- Source: Apple, “App information — Availability in China mainland”.
- URL: https://developer.apple.com/cn/help/app-store-connect/reference/app-information/app-information/
- Evidence: some apps require an ICP filing number in mainland China; games, books/magazines, religion and news have additional permit requirements.
- Use: support the “decide regions early; assess by function and category” annotation.

### S11 — Update rollout

- Source: Apple, “Release a version update in phases”.
- URL: https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases
- Evidence: iOS updates may use a seven-day phased rollout from 1% to 100% of eligible automatic-update users.
- Use: distinguish first launch from safer update operations.

## Local operating evidence

- `docs/app-store/SUBMISSION.md`: release checklist used by the current Expo SDK 57 project.
- `docs/app-store/APP_PRIVACY.md`: data-flow and privacy declaration evidence.
- `docs/app-store/REVIEW_NOTES.md`: reviewer path that makes the core workflow directly testable.
- Required local gates before merge: `npm run typecheck`, `npm run doctor`, `npx expo export --platform ios`.

## Material deliberately excluded

- Android stores, notarization-only distribution, enterprise distribution and EU alternative marketplaces.
- Full App Review guideline taxonomy.
- Detailed subscription, in-app purchase, game-license and regulated-industry workflows.
- App-specific credentials, personal contact data and private signing material.
