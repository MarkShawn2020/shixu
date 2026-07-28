# 拾序 iOS 首发清单

## 已在仓库固化

- App Store 版本：`1.0.0`
- Bundle ID：`ai.lovstudio.shixu`
- EAS 项目：`@markshawn2020/shixu`
- 分发目标：iPhone，iOS 16.4+
- 加密出口申报：不使用受限加密
- App 隐私：不跟踪、不收集数据
- EAS production 构建自动递增 build number
- 商店中文元数据、分类、年龄分级和审核说明
- 5 张 6.9 英寸 iPhone 竖屏截图（1320 × 2868、RGB、无透明通道）

## Apple 侧一次性资料

首次运行生产构建或提交命令时，按 CLI 提示确认：

- Apple Developer Team：`APPLE_TEAM_ID`
- App Store Connect App Apple ID：`ASC_APP_ID`
- 审核联系电话：`REVIEW_PHONE`
- 价格与销售范围
- App 隐私问题选择“不，我们不会从此 App 收集数据”
- 将仓库内截图与元数据同步到 App Store Connect

已生成截图场景：

1. 实时锁定纸张边缘
2. 自动透视校正与智能高清
3. 多页排序与页面效果
4. PDF / JPEG 本地导出
5. 本机扫描历史与隐私说明

## 命令

```bash
npm run release:build
npm run ios:build
npm run ios:submit
npm run store:metadata
```

生产构建并自动上传 App Store Connect：

```bash
npm run ios:release
```
