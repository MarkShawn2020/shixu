# 拾序 App 隐私申报

## App Store Connect 选项

- 数据收集：选择“不，我们不会从此 App 收集数据”
- 跟踪：否
- 使用 App Tracking Transparency：否
- 隐私政策：<https://lovstudio.ai/privacy>

## 申报依据

拾序没有账号、广告、分析 SDK、业务后端或远程上传接口。相机照片、
相册导入图片、扫描历史、页面设置与导出结果均保存在设备本地。
用户主动调用系统分享面板或保存到相册时，数据由 iOS 交给用户选择的目标。

App 隐私标签中的“收集”指数据被传出设备，并由开发者或第三方在完成实时请求
所需时间之外继续访问。拾序的文档处理链路不发生此类传输。

## 权限用途

- 相机：连续拍摄并扫描纸质文件
- 照片读取：导入用户主动选择的图片
- 照片写入：保存用户主动导出的扫描图片

## PrivacyInfo.xcprivacy

`app.json` 声明不跟踪、不收集数据，并合并项目及静态依赖使用的
File Timestamp、User Defaults、Disk Space、System Boot Time required-reason
API 理由。自定义文档模块访问 App 容器内 PDF 文件大小，对应 `C617.1`。
