# Windows 发版操作清单（OV / EV 代码签名）

> 适用：i 快招 Electron 客户端 Windows 端发版；当前在 macOS 主力机上交叉打包 Windows 包
>
> 配套：[`docs/client-signing-guide.md`](./client-signing-guide.md) 原理介绍 / [`docs/macos-release.md`](./macos-release.md) macOS 对应文档

---

## 0. TL;DR

| 阶段 | 命令 | 用户体验 |
|---|---|---|
| **现在能跑（无证书）** | `npm run build:win:dev` | SmartScreen 警告"未知发布者"，点"仍要运行"能装 |
| **OV 证书到位（推荐 MVP）** | `npm run build:win:release` | 仍有警告但弱化，3000+ 次下载后 SmartScreen 自动信任 |
| **EV 证书到位（半年后升级）** | `npm run build:win:release` | **立刻无警告**，最佳体验 |

5 分钟决策：

| 你的情况 | 选择 |
|---|---|
| 紧急要发版（不在意 3000 次安装内的 SmartScreen 警告） | **OV 证书** |
| 用户量大 / 重视品牌 | **EV 证书 + 云托管**（DigiCert KeyLocker / SSL.com eSigner / Azure Key Vault） |
| 公司有专人维护 USB token + 内部 CI 在 Windows 机器跑 | **EV 证书 + 传统 USB token** |

---

## 1. 证书选型对比

### 1.1 OV vs EV：核心差异

| 维度 | OV (Organization Validation) | EV (Extended Validation) |
|---|---|---|
| **价格** | ¥1500-3500 / 年 | ¥2500-5000 / 年 |
| **下证周期** | 1-7 天（国内 CA 最快 3 天） | 1-2 周 |
| **SmartScreen 行为** | 前期警告 → 积累约 3000 次安装后信任 | **立即信任**，零警告 |
| **存储介质** | `.pfx` 文件，可拷贝 | USB token / 云 HSM（2023 年起 Microsoft 强制） |
| **macOS 上能否签名** | ✅ 直接用 `.pfx` | ❌ 传统 USB 不行；云托管 ✅ |
| **CI/CD 友好** | ✅ secrets 注入 .pfx | 传统 ❌ / 云托管 ✅ |

### 1.2 云托管 EV（推荐 EV 用户走这条）

云托管 = 证书私钥放在云 HSM 里，本地用云服务商提供的工具签名，不需要硬件 token。优点：

- macOS / Linux 也能签 Windows 包
- 适配 GitHub Actions / GitLab CI 等 CI
- 跟传统 USB token 价格相当

| 服务商 | 适配度 | 费用 | 备注 |
|---|---|---|---|
| **DigiCert KeyLocker** | ⭐⭐⭐⭐⭐ | EV 证书自带，无额外费用 | electron-builder 内置支持 |
| **SSL.com eSigner** | ⭐⭐⭐⭐⭐ | EV 证书自带 | electron-builder 内置支持 |
| **Azure Key Vault** | ⭐⭐⭐⭐ | 证书 + Azure 订阅 (~$1/月) | 适合已有 Azure 基础设施 |
| **GlobalSign Atlas** | ⭐⭐⭐ | 包含 | 国际通用 |

### 1.3 国内 vs 国外 CA

| CA | 类型 | 价格（OV） | 周期 | 备注 |
|---|---|---|---|---|
| **GDCA（数安时代）** | 国内 | ¥1500-2000 | 3-5 天 | 国内最大，可对公转账 |
| **沃通 WoSign** | 国内 | ¥1500-2200 | 5-7 天 | 历史口碑差但仍可用 |
| **天威诚信** | 国内 | ¥1800 | 5 天 | |
| **DigiCert** | 国外 | ~$300 | 5-7 天 | 国际通用，企业首选 |
| **SSL.com** | 国外 | ~$150 | 3-5 天 | 性价比高，UI 友好 |
| **Sectigo / Comodo** | 国外 | ~$250 | 5 天 | |

**推荐**：
- 国内公司 + 紧急发版 → **GDCA OV**（对公转账，3 天能下证）
- 跨国 / 海外用户多 → **SSL.com OV**（信用卡支付，3 天下证；后续升级 EV 也方便）

---

## 2. OV 证书申请实战（推荐 MVP 路线）

### 2.1 准备资料

公司侧准备：
- ✅ 营业执照副本（PDF / JPG，需清晰）
- ✅ 公司常用电话（CA 会回拨验证；如果是分机注意通畅）
- ✅ 法人 / 经办人身份证正反面
- ✅ 公司域名（如 `ihire365.com`，证书 OU 字段会写）
- ⚠️ **D-U-N-S 编号**（DigiCert / Sectigo 等大多需要，国内 CA 一般不需要）

D-U-N-S 编号查询 / 申请：

```bash
# 美国邓白氏 D-U-N-S 在线申请，对中国公司也免费：
# https://www.dnb.com/duns-number/lookup.html
# 提交后 1-2 天返回 9 位 D-U-N-S 号
```

### 2.2 国内 CA 申请流程（以 GDCA 为例）

1. [https://www.gdca.com.cn](https://www.gdca.com.cn) → 代码签名证书 → 选 **OV** → 1 年
2. 填写申请表（在线表单），上传：
   - 营业执照
   - 法人 / 经办人身份证
3. 对公转账（约 ¥1800-2200）
4. CA 客服回拨验证电话（关键步骤，注意接电话）
5. 3-5 天后 CA 邮件发来证书：
   - `cert.cer` — 证书公钥
   - `private.key` — 私钥（自己生成 CSR 时留下的，或 CA 邮件里给）
   - 或者直接打包 `cert.pfx` + 密码

### 2.3 国外 CA 申请流程（以 SSL.com 为例，最快路线）

1. [https://www.ssl.com/certificates/code-signing/](https://www.ssl.com/certificates/code-signing/)
2. 选 OV / 1 year，加入购物车，结账（信用卡 / PayPal）
3. SSL.com 后台填写公司信息 + 邓白氏 D-U-N-S
4. 上传营业执照（中英文公证件最稳，不强求）
5. CA 后端审核（含电话验证），3-5 天通过
6. 后台一键导出 `.pfx`（或在 keychain / Windows 证书管理器里导出）

### 2.4 拿到 .cer + 私钥后转 .pfx

如果 CA 给你的是 `.cer + .key` 而不是 `.pfx`，自己合：

```bash
# 命令需要 openssl（mac 自带）
openssl pkcs12 -export \
  -out CodeSigning.pfx \
  -inkey private.key \
  -in cert.cer \
  -name "i快招代码签名证书"

# 提示输入 export password — 这就是 WIN_CSC_KEY_PASSWORD
```

如果证书有中间证书链（多数情况），合并时也带上：

```bash
openssl pkcs12 -export \
  -out CodeSigning.pfx \
  -inkey private.key \
  -in cert.cer \
  -certfile ca-bundle.crt \
  -name "i快招代码签名证书"
```

---

## 3. 一次性准备 env

把 `.pfx` 放到不会同步到 git 的目录（推荐 `~/secure/`）：

```bash
mkdir -p ~/secure
mv ~/Downloads/CodeSigning.pfx ~/secure/
chmod 600 ~/secure/CodeSigning.pfx  # 仅自己可读
```

把以下 env 加到 `~/.ikuaizhao.env`（与 macOS 共用一个文件）：

```bash
# Windows OV/EV 代码签名
export WIN_CSC_LINK="$HOME/secure/CodeSigning.pfx"
export WIN_CSC_KEY_PASSWORD="<导出 .pfx 时设的密码>"
```

---

## 4. macOS 上交叉打包 Windows（核心解决方案）

我们的开发主力机是 mac，但 Windows 安装包要在 Windows 上签名（`signtool.exe`）。`electron-builder` 内置了 macOS 上签 Windows 的方案——用 `osslsigncode` 替代 `signtool.exe`。

### 4.1 装 osslsigncode

```bash
brew install osslsigncode

# 验证
osslsigncode --version
# 期望输出: osslsigncode 2.x
```

### 4.2 在 yml 启用 Windows 签名

`electron/electron-builder.yml` 改 `win.signtoolOptions`：

```yaml
win:
  icon: resources/icons/icon.ico
  executableName: ikuaizhao
  signtoolOptions:                              # ← 新加
    sign: true
    signingHashAlgorithms: ['sha256']
    timeStampServer: http://timestamp.sectigo.com  # 时间戳服务器（免费公共）
    rfc3161TimeStampServer: http://timestamp.sectigo.com
```

> ⚠️ `timeStampServer` 必须配，否则证书过期后已签名的旧版本会失效。Sectigo 的免费时间戳服务器最稳；国内可用阿里云的 `http://timestamp.aliyun.com`（备用）。

---

## 5. 跑 release 打包

```bash
cd electron
source ~/.ikuaizhao.env

# 校验 env 已设全（脚本会 fail-fast 如果缺）
npm run build:win:release
```

期间会输出：

```
• packaging       platform=win32 arch=x64 electron=38.1.2 appOutDir=dist/win-unpacked
• signing         file=dist/win-unpacked/ikuaizhao.exe
• building        target=NSIS file=dist/i快招-1.0.0-setup.exe
• signing         file=dist/i快招-1.0.0-setup.exe
```

最终产物：`dist/i快招-1.0.0-setup.exe`（已签名）+ `latest.yml`（自动更新 manifest）

---

## 6. 验证签名

### 6.1 macOS 上验证（用 osslsigncode）

```bash
osslsigncode verify dist/i快招-1.0.0-setup.exe
```

期望输出：

```
Current PE checksum   : 02ABCDEF
Calculated PE checksum: 02ABCDEF

Signature Index: 0  (Primary Signature)
Message digest algorithm  : SHA256
Current message digest    : ...
Calculated message digest : ...   <- match!

Authenticated attributes:
    ...
    Signing time: ...
    Signed by:    OV-i快招公司名

Number of signers: 1
Signer #0:
    Subject: /C=CN/O=公司名/CN=...
    ...
        Signature verification: ok
Number of certificates: N
...
Succeeded
```

### 6.2 Windows 上验证（拿到一台 Win 机器）

```powershell
signtool verify /pa /v dist\i快招-1.0.0-setup.exe
```

期望输出：
```
Successfully verified: dist\i快招-1.0.0-setup.exe
```

### 6.3 GUI 验证

右键 `i快招-1.0.0-setup.exe` → 属性 → **数字签名**标签页

应能看到证书链：
- 公司名（OV）/ 公司名 (EV)
- 颁发者：DigiCert / SSL.com / GDCA / ...
- 时间戳：Sectigo / Aliyun / ...

---

## 7. SmartScreen 信誉积累（OV 用户必看）

OV 证书签了之后，**初期仍会弹 SmartScreen 警告**。Microsoft 用一套"声誉机器学习"判断 .exe 是否安全，需要：

- 至少 3000+ 次独立 IP 下载并安装
- 数周时间内没有恶意行为报告
- 然后 SmartScreen 自动把你列入"已知发布者"白名单

**临时绕过**（提示用户）：
1. 用户双击 `setup.exe` 看到蓝屏 "Windows 已保护你的电脑"
2. 点击"更多信息"
3. 出现"仍要运行"按钮，点击即可

**加速积累**（可选）：
- 主动提交到 [https://www.microsoft.com/wdsi/filesubmission/](https://www.microsoft.com/wdsi/filesubmission/) 做 SmartScreen 静态分析
- 联系 CA 协助加速（GDCA / DigiCert 部分套餐含此服务）

EV 用户不用担心，**第一次签的版本就立刻无警告**。

---

## 8. 升级到 EV + 云托管

OV 走通后想升级 EV，推荐 SSL.com eSigner（操作最简洁）：

### 8.1 SSL.com eSigner 流程

1. 在 SSL.com 后台买 EV 证书（~$300/年）
2. 验证（电话 + 视频会议确认是公司本人）
3. CA 把证书托管在 SSL.com eSigner（云 HSM）
4. 后台拿到三个值：
   - `eSigner Username`
   - `eSigner Password`
   - `eSigner TOTP secret`（OTP 二步验证）

### 8.2 修改 electron-builder.yml

```yaml
win:
  signtoolOptions:
    sign: true
    signingHashAlgorithms: ['sha256']
    # 用 SSL.com 提供的 CodeSignTool（云签名）替代本地 .pfx
    # 详见 https://www.ssl.com/how-to/cloud-code-signing-integration-with-electron-builder/
```

加自定义 sign hook：

```yaml
win:
  signtoolOptions:
    signWithToolDir: ./scripts/codesigntool
    signWithToolPlatform: SSL.com
```

具体集成代码 SSL.com 文档有（参考链接同上）。我这边后续可以直接帮你接，等 EV 证书拿到后告诉我。

### 8.3 DigiCert KeyLocker

类似流程，支持的 env：

```bash
export SM_HOST="https://clientauth.one.digicert.com"
export SM_API_KEY="..."
export SM_CLIENT_CERT_FILE="$HOME/secure/digicert-client.p12"
export SM_CLIENT_CERT_PASSWORD="..."
export SM_CODE_SIGNING_CERT_SHA1_HASH="..."
```

electron-builder 已原生支持，配好 env 后 `npm run build:win:release` 直接走云签名。

---

## 9. CI/CD 集成

GitHub Actions secrets 注入 .pfx（base64 编码）：

```yaml
# .github/workflows/release.yml
- name: Setup .pfx for Windows signing
  if: matrix.os == 'windows-latest'
  run: |
    echo "${{ secrets.WIN_CERT_PFX_BASE64 }}" | base64 -d > $HOME/cert.pfx
    echo "WIN_CSC_LINK=$HOME/cert.pfx" >> $GITHUB_ENV
  env:
    WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}

- name: Build Windows
  if: matrix.os == 'windows-latest'
  run: cd electron && npm run build:win:release
  env:
    WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
```

把 .pfx 转 base64：
```bash
base64 -i ~/secure/CodeSigning.pfx | pbcopy
# 粘贴到 GitHub repo settings → Secrets → Actions → 新建 WIN_CERT_PFX_BASE64
```

---

## 10. 常见问题

### Q1：osslsigncode: command not found

`brew install osslsigncode` 没装。装好后重新 source 终端环境。

### Q2：electron-builder 报 `cannot find signtool.exe`

`signtoolOptions.sign: true` 但未在 macOS 上配 osslsigncode 路径。检查 yml 写法（参考 §4.2）。

如果还不行，明确告诉 electron-builder 用 osslsigncode：

```bash
export ELECTRON_BUILDER_SIGN_TOOL=osslsigncode
```

### Q3：签名后双击 .exe 仍弹 SmartScreen

**OV 用户**：正常，需要积累 3000+ 次安装信誉，参考 §7。
**EV 用户**：检查证书是否真的是 EV（不是 OV 混淆）；右键 .exe → 属性 → 数字签名 → 详细信息 → 高级 → 应能看到"扩展验证 (EV)"字样。

### Q4：时间戳服务器超时

```bash
# 备用时间戳服务器，按顺序尝试：
http://timestamp.sectigo.com
http://timestamp.digicert.com
http://timestamp.aliyun.com    # 国内
http://timestamp.entrust.net/TSS/RFC3161sha2TS
```

如果家里 / 公司网络 ping 不通国外时间戳，先用 aliyun 兜底。

### Q5：.pfx 密码搞错了

跑 release 时报 `MAC verify error: invalid password`。最直接验证方法：

```bash
openssl pkcs12 -in ~/secure/CodeSigning.pfx -nokeys -info
# 提示 Enter Import Password，输错就报 bad decrypt
```

如果 .pfx 文件本身坏了，回到 §2.4 重新合成。

---

## 11. 文档变更记录

| 日期 | 作者 | 变更 |
|---|---|---|
| 2026-05-09 | lewin | 初稿：OV/EV 选型 + macOS 交叉签 Windows + SSL.com / DigiCert / Azure 云托管 |
