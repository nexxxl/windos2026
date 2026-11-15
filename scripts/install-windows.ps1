<#
  一键安装 NexlOS 插件到本机 DSH（Windows）。

  做的事只有四件：校验来源 → 复制插件 → 写 profile 的 link 依赖 → 建 junction。
  不跑 npm install、不建虚拟环境、不碰用户数据目录（config.home）。

  示例：
    powershell -ExecutionPolicy Bypass -File install-windows.ps1
    powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Profile nexlwin
    powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [string]$Profile,
  [string]$Target = (Join-Path $env:USERPROFILE 'nexl\plugin'),
  [string]$Source = (Split-Path -Parent $PSScriptRoot),
  [switch]$Uninstall,
  [switch]$Restart,
  [string]$TaskName
)

# 终端默认 GBK，中文提示会乱码；只影响当前进程的输出编码。
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$ErrorActionPreference = 'Stop'
$PackageName = '@nexlos/os'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Step($text) { Write-Host "==> $text" }
function Fail($text) { Write-Host "错误：$text" -ForegroundColor Red; exit 1 }

# 读取 JSON 时去掉可能的 BOM，DSH 与手工编辑都可能留下。
function Read-JsonFile($path) {
  $raw = [System.IO.File]::ReadAllText($path)
  $raw = $raw.TrimStart([char]0xFEFF)
  return $raw | ConvertFrom-Json
}
function Write-JsonFile($path, $obj) {
  $json = $obj | ConvertTo-Json -Depth 12
  [System.IO.File]::WriteAllText($path, $json + "`n", $Utf8NoBom)
}

# dsh 用 $env:DSH_HOME 定位档案；这里必须跟它一致，否则自定义 DSH_HOME 的机器会装到错误的 home。
function Get-ProfilesRoot {
  $root = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
  Join-Path $root 'profiles'
}

# 没给 -Profile 时，从正在运行的 dsh 进程里读 --profile，避免装到别的档案。
function Resolve-Profile {
  if ($Profile) { return $Profile }
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
  $names = @()
  foreach ($p in $procs) {
    if ($p.CommandLine -and $p.CommandLine -match 'dsh' -and $p.CommandLine -match '--profile\s+"?([^\s"]+)') {
      $names += $Matches[1]
    }
  }
  $names = $names | Select-Object -Unique
  if ($names.Count -eq 1) { return $names[0] }
  if ($names.Count -gt 1) { Fail "同时有多个 dsh 档案在运行（$($names -join ', ')），请用 -Profile 指定。" }
  $available = Get-ChildItem (Get-ProfilesRoot) -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
  Fail "没有检测到运行中的 dsh。现有档案：$($available -join ', ')。请用 -Profile <名称> 指定。"
}

$profileName = Resolve-Profile
$profileDir = Join-Path (Get-ProfilesRoot) $profileName
$profileJson = Join-Path $profileDir 'package.json'
if (-not (Test-Path -LiteralPath $profileJson)) { Fail "档案不存在：$profileJson" }

# 统一用正斜杠写入 package.json，跨盘符与中文路径都不需要转义。
$linkTarget = ($Target -replace '\\', '/')

Write-Step "档案 $profileName"
Write-Step "插件目录 $Target"

if ($Uninstall) {
  $pkg = Read-JsonFile $profileJson
  if ($pkg.dependencies -and $pkg.dependencies.PSObject.Properties.Name -contains $PackageName) {
    $pkg.dependencies.PSObject.Properties.Remove($PackageName)
  }
  if ($pkg.dsh -and $pkg.dsh.profile -and $pkg.dsh.profile.bundles) {
    $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles | Where-Object { $_ -ne $PackageName })
  }
  Write-JsonFile $profileJson $pkg
  $link = Join-Path $profileDir 'node_modules\@nexlos\os'
  if (Test-Path -LiteralPath $link) { cmd /c rmdir "$link" | Out-Null }
  Write-Step "已从 profile 移除（插件文件保留在 $Target）"
  exit 0
}

# 来源必须是可用的插件目录，避免把脚本目录本身复制进去。
if (-not (Test-Path -LiteralPath (Join-Path $Source 'package.json'))) { Fail "来源目录缺少 package.json：$Source" }
$sourcePkg = Read-JsonFile (Join-Path $Source 'package.json')
if ($sourcePkg.name -ne $PackageName) { Fail "来源不是 $PackageName（实际：$($sourcePkg.name)）" }

# 覆盖式复制：node_modules/.git 不参与，其余以来源为准。robocopy 的 0-7 都算成功。
if ((Resolve-Path -LiteralPath $Source).Path -ne (Resolve-Path -LiteralPath $Target -ErrorAction SilentlyContinue).Path) {
  Write-Step "复制插件文件"
  $rc = Start-Process -FilePath robocopy.exe -ArgumentList @(
    "`"$Source`"", "`"$Target`"", '/MIR', '/XD', 'node_modules', '.git', '.github',
    '/NFL', '/NDL', '/NJH', '/NJS', '/NP'
  ) -Wait -PassThru -NoNewWindow
  if ($rc.ExitCode -ge 8) { Fail "robocopy 失败（退出码 $($rc.ExitCode)）" }
}

# profile 里登记 link 依赖与 bundle；两者缺一，宿主都不会加载插件。
$pkg = Read-JsonFile $profileJson
if (-not $pkg.dependencies) { $pkg | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) -Force }
$pkg.dependencies | Add-Member -NotePropertyName $PackageName -NotePropertyValue ("link:" + $linkTarget) -Force
if (-not $pkg.dsh) { Fail "profile 缺少 dsh.profile.bundles：$profileJson" }
if (-not $pkg.dsh.profile -or -not $pkg.dsh.profile.bundles) { Fail "profile 缺少 dsh.profile.bundles：$profileJson" }
if ($pkg.dsh.profile.bundles -notcontains $PackageName) { $pkg.dsh.profile.bundles = @($pkg.dsh.profile.bundles) + $PackageName }
Write-JsonFile $profileJson $pkg

# junction 不需要管理员权限；符号链接在未开开发者模式的机器上会失败。
$scope = Join-Path $profileDir 'node_modules\@nexlos'
if (-not (Test-Path -LiteralPath $scope)) { New-Item -ItemType Directory -Path $scope -Force | Out-Null }
$link = Join-Path $scope 'os'
if (Test-Path -LiteralPath $link) { cmd /c rmdir "$link" | Out-Null }
$mk = Start-Process -FilePath cmd.exe -ArgumentList @('/c', 'mklink', '/J', "`"$link`"", "`"$Target`"") -Wait -PassThru -WindowStyle Hidden
if ($mk.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $link)) { Fail "创建 junction 失败：$link -> $Target" }

Write-Step "完成：$link -> $Target"

if ($Restart) {
  if ($TaskName) {
    Write-Step "重启计划任务 $TaskName"
    schtasks /End /TN $TaskName | Out-Null
    Start-Sleep -Seconds 1
    schtasks /Run /TN $TaskName | Out-Null
  } else {
    Write-Host "未指定 -TaskName，跳过自动重启。" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "下一步：重启 DSH（关掉当前 dsh 进程后按原方式启动），在 DSH 侧栏点「NexlOS 桌面」进入。"
# 浏览器的地址栏直达会被宿主的导航护栏拦成 403；宿主页面里的 iframe 入口才是受支持的路径。
Write-Host "说明：不要在地址栏直接打开 /nexlos/（宿主返回 forbidden），要从 DSH 界面进入。"
Write-Host "验证命令： curl.exe -s -o NUL -w `"%{http_code}`" http://127.0.0.1:8891/nexlos/health   # 需带宿主 cookie，否则 401"
