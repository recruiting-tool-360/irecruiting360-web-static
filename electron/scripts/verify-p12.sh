#!/usr/bin/env bash
# 验证 .p12 是不是合法的 Developer ID Application 证书
#
# 用法:
#   bash electron/scripts/verify-p12.sh <p12 文件路径> [p12 密码]
#   或者已 source ~/.ikuaizhao.env 后直接:
#   bash electron/scripts/verify-p12.sh
#
# 通过条件:
#   ① subject 含 "Developer ID Application"
#   ② OU (Team ID) 与 APPLE_TEAM_ID 一致

set -e

P12_PATH="${1:-${CSC_LINK:-}}"
P12_PASS="${2:-${CSC_KEY_PASSWORD:-}}"
EXPECTED_TEAM="${APPLE_TEAM_ID:-}"

if [[ -z "$P12_PATH" ]]; then
  echo "❌ 用法: bash $0 <p12 文件路径> [p12 密码]" >&2
  echo "   或先 source ~/.ikuaizhao.env" >&2
  exit 2
fi

if [[ ! -f "$P12_PATH" ]]; then
  echo "❌ 文件不存在: $P12_PATH" >&2
  exit 1
fi

if [[ -z "$P12_PASS" ]]; then
  read -srp ".p12 密码: " P12_PASS
  echo
fi

echo "===== 检查 $P12_PATH ====="

TMP="/tmp/verify-p12-$$.keychain"
trap 'security delete-keychain "$TMP" 2>/dev/null || true' EXIT

security create-keychain -p "tmppass" "$TMP"

if ! security import "$P12_PATH" -k "$TMP" -P "$P12_PASS" 2>&1 | tail -2; then
  echo "❌ 导入失败 — 密码错误或文件损坏" >&2
  exit 1
fi

# 拿出证书的 subject
SUBJECT=$(security find-certificate -a -p "$TMP" | openssl x509 -noout -subject 2>/dev/null || true)

if [[ -z "$SUBJECT" ]]; then
  echo "❌ 无法读取证书 subject" >&2
  exit 1
fi

echo ""
echo "证书 subject:"
echo "  $SUBJECT"
echo ""

# 检查类型
if echo "$SUBJECT" | grep -q "Developer ID Application:"; then
  echo "✅ 证书类型: Developer ID Application（正确）"
else
  echo "❌ 证书类型不对"
  echo "   实际是: $(echo "$SUBJECT" | grep -oE 'CN=[^,]+' | head -1)"
  echo "   需要的: Developer ID Application: <公司名> (Team ID)"
  echo ""
  echo "   请让 Account Holder 在 Apple Developer 后台"
  echo "   选择 \"Developer ID Application\" 类型重新创建证书"
  exit 1
fi

# 检查 Team ID
TEAM_FROM_CERT=$(echo "$SUBJECT" | grep -oE 'OU=[A-Z0-9]+' | head -1 | cut -d= -f2)
echo ""
echo "证书 Team ID:    $TEAM_FROM_CERT"
if [[ -n "$EXPECTED_TEAM" ]]; then
  echo "期望 Team ID:    $EXPECTED_TEAM"
  if [[ "$TEAM_FROM_CERT" == "$EXPECTED_TEAM" ]]; then
    echo "✅ Team ID 匹配"
  else
    echo "❌ Team ID 不匹配 — .p12 是另一个团队的证书"
    exit 1
  fi
else
  echo "(未设 APPLE_TEAM_ID，跳过 Team ID 校验)"
fi

echo ""
echo "🎉 .p12 验证通过，可以跑 npm run build:mac:release"
