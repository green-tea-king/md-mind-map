# Windows WebDAV 專案的安全 Git／部署維護指南

這份文件整理在 Windows 映射磁碟、RaiDrive 或 WebDAV 路徑上維護 Git 專案時，處理偶發 `Permission denied`、Git discovery 失敗與子程序工作目錄錯誤的通用做法。

適用情境：

- 原始專案必須留在既有 WebDAV 路徑。
- 不可搬移檔案、不建立副本專案、不更換部署平台。
- 部署工具使用 PowerShell，並呼叫 Git、Node、PowerShell 或瀏覽器。

## 1. 先分辨問題在哪一層

`Permission denied` 不一定是帳號權限錯誤，常見有四層：

1. PowerShell 在 WebDAV 路徑執行 `Resolve-Path`、`Get-Item` 或 `Get-FileHash`。
2. Git 以 WebDAV 路徑作為目前工作目錄，啟動時先碰到路徑存取失敗。
3. Node／PowerShell 子程序以 WebDAV 路徑作為 `WorkingDirectory`。
4. 子程序工作目錄已移到本機 Temp，但仍傳入相對路徑，例如 `scripts/check.js`，導致 `MODULE_NOT_FOUND` 或找不到腳本。

先記錄完整錯誤、命令、工作目錄與重試次數，再決定修正位置；不要先改 WebDAV 設定或把錯誤當成成功。

## 2. 核心設計原則

- 原始檔案路徑保持不變；只把「子程序目前工作目錄」移到本機穩定資料夾。
- Git 永遠明確指定 `--git-dir`、`--work-tree` 與單次命令的 `safe.directory`。
- WebDAV 瞬時讀取只允許有限次數重試；最後仍失敗就停止部署。
- 子程序參數使用明確的專案絕對路徑或 UNC 路徑，不依賴 WebDAV cwd。
- push 後同時驗證遠端 `ls-remote` 與本機工作樹；本機 `refs/remotes/origin/*` 暫時落後不代表遠端失敗。
- 不使用 `git add .`、不 force push、不自動刪除檔案、不修改 WebDAV 設定。

## 3. 穩定的本機子程序工作目錄

```powershell
function Get-StableProcessWorkingDirectory {
  $tempPath = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not (Test-Path -LiteralPath $tempPath -PathType Container)) {
    throw "Stable process working directory is unavailable: $tempPath"
  }
  return $tempPath
}
```

Git、Node、PowerShell、HTTP server、Chrome 等子程序都使用：

```powershell
-WorkingDirectory (Get-StableProcessWorkingDirectory)
```

這不會搬移專案；專案仍由參數明確指向原本的 WebDAV 路徑。

## 4. Git 命令固定 repository 邊界

```powershell
$gitRepo = (Resolve-Path -LiteralPath $Repo -ErrorAction Stop).ProviderPath
$gitArguments = @(
  '-c', "safe.directory=$gitRepo",
  "--git-dir=$(Join-Path $gitRepo '.git')",
  "--work-tree=$gitRepo"
) + $Arguments

Invoke-InProcessNative `
  -FilePath 'git' `
  -Arguments $gitArguments `
  -WorkingDirectory (Get-StableProcessWorkingDirectory)
```

注意：`safe.directory` 是單次命令設定，不要為了方便修改全域 Git 設定。

## 5. WebDAV 路徑解析要有有限重試

`Resolve-Path` 可能在 Git 命令開始前就失敗，因此不能只在 Git 執行後重試。

```powershell
$script:WebDavReadMaxAttempts = 3

function Resolve-RepositoryProviderPath {
  param([Parameter(Mandatory)][string]$Repo)

  for ($attempt = 1; $attempt -le $script:WebDavReadMaxAttempts; $attempt++) {
    try {
      return (Resolve-Path -LiteralPath $Repo -ErrorAction Stop).ProviderPath
    } catch {
      if ($attempt -ge $script:WebDavReadMaxAttempts) { throw }
      Start-Sleep -Milliseconds (200 * $attempt)
    }
  }
  throw "Unable to resolve repository provider path: $Repo"
}
```

重試應有上限與遞增等待，不要無限迴圈，也不要把所有錯誤永遠吞掉。

## 6. Node／PowerShell 腳本不可再依賴相對路徑

錯誤示例：

```powershell
Invoke-InProcessNative node @('scripts/check-version.js') `
  -WorkingDirectory (Get-StableProcessWorkingDirectory)
```

修正方式是把腳本路徑轉成明確路徑；Node 可用 `process.chdir` 指向專案後再載入：

```powershell
$childArguments = @(
  '-e',
  'process.chdir(process.argv[1]); require(process.argv[2]);',
  (Resolve-ChildProcessPath $Repo),
  (Resolve-ChildProcessPath (Join-Path $Repo 'scripts/check-version.js'))
)

Invoke-InProcessNative node $childArguments `
  -WorkingDirectory (Get-StableProcessWorkingDirectory)
```

PowerShell 腳本則傳入解析後的絕對／UNC 路徑：

```powershell
$scriptPath = (Resolve-Path -LiteralPath (Join-Path $Repo 'scripts/check-deploy.ps1')).ProviderPath
Invoke-InProcessNative pwsh @('-NoProfile', '-File', $scriptPath) `
  -WorkingDirectory (Get-StableProcessWorkingDirectory)
```

路徑解析本身也可能遇到 WebDAV 瞬斷，因此應放在同一個有限重試範圍內。

## 7. 子程序呼叫的建議結構

部署工具可將 Git、Node、PowerShell 統一收斂到一個 seam：

```powershell
for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  try {
    return Invoke-InProcessNative `
      -FilePath $FilePath `
      -Arguments $ExplicitArguments `
      -WorkingDirectory (Get-StableProcessWorkingDirectory)
  } catch {
    if ($attempt -ge $MaxAttempts) { throw }
    Start-Sleep -Milliseconds (200 * $attempt)
  }
}
```

建議每次重試保留：命令名稱、attempt／MaxAttempts、例外類型與簡短訊息；不可記錄 Token、密碼或完整私人路徑內容。

## 8. 驗證清單

修改後至少執行：

```powershell
# 版本／結構檢查
node scripts/check-version-consistency.test.js
node scripts/check-version-consistency.js

# PowerShell 部署契約測試
pwsh -NoProfile -File scripts/test-deploy.ps1

# 空白與語法檢查
git diff --check
```

若有瀏覽器或網站部署，再增加：

- Node `vm.Script` 解析正式腳本。
- 本機 HTTP server + Chrome 自檢。
- 正式站 cache-busted URL 的版本、品牌、頁面錯誤、console 錯誤。
- 遠端 `git ls-remote` 的 HEAD 必須等於預期 commit。

## 9. 如何解讀常見結果

| 現象 | 判斷 | 建議 |
|---|---|---|
| `Resolve-Path ... Permission denied` | WebDAV 讀取在 Git 前就中斷 | 對路徑解析加有限重試 |
| Git discovery 找不到 repository | 子程序 cwd 或 Git 邊界不固定 | 使用穩定本機 cwd + 明確 git-dir/work-tree |
| `MODULE_NOT_FOUND: Temp\\scripts\\...` | cwd 已移到 Temp，但腳本仍是相對路徑 | 傳入絕對／UNC 腳本路徑 |
| push 失敗但遠端已更新 | push 結果不確定或本機追蹤參照落後 | 重新查 `ls-remote`，不要重複 push |
| 本機 `origin/master` 落後、遠端 HEAD 正確 | tracking ref 尚未更新 | 可稍後 fetch；不可把它誤判為正式部署失敗 |

## 10. 不建議的做法

- 不要把 WebDAV 專案搬到本機再部署，除非需求明確允許架構改變。
- 不要改 WebDAV 權限、帳號、掛載設定來掩蓋程式問題。
- 不要用無限重試、長時間輪詢或忽略 exit code。
- 不要用 `git add .`、force push、reset 或自動清理未追蹤檔。
- 不要把「某次成功」當成問題已消失；至少要有回歸測試與多次 DryRun。

## 11. 移植到其他專案時需要替換的項目

請依目標專案替換：

1. repository 絕對路徑與 UNC 映射方式。
2. 預期 branch、remote URL 與部署平台。
3. Node／PowerShell／測試腳本清單。
4. Protected untracked files allowlist。
5. 版本來源、Changelog 與正式站驗證方式。
6. Chrome／HTTP server 或其他建置工具的本機閘門。

移植完成後，先做唯讀 DryRun，再決定是否 commit、push 或正式部署。
