# Fork-only. Merges upstream's main into this fork and rebuilds the extension
# into .output/chrome-mv3, so the unpacked extension Chrome loads stays current,
# then pushes the merge to origin.
#
#   pwsh scripts/sync-upstream.ps1            # sync now
#   pwsh scripts/sync-upstream.ps1 -Install   # run at every logon
#   pwsh scripts/sync-upstream.ps1 -Uninstall
#
# Nothing is touched unless the work tree is clean and on main. A merge that
# conflicts, or a merged tree that fails the type check or the build, is
# rolled back to where the fork was, and a notification says so.
param(
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$taskName = "ReadFrogSyncUpstream"
$upstreamUrl = "https://github.com/mengxi-ream/read-frog.git"
$logFile = Join-Path $repo ".output\sync-upstream.log"

if ($Install) {
  $shell = (Get-Process -Id $PID).Path
  $action = New-ScheduledTaskAction -Execute $shell `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`"" `
    -WorkingDirectory $repo
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Force | Out-Null
  Write-Host "Installed scheduled task '$taskName' (runs at logon)."
  exit 0
}

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Removed scheduled task '$taskName'."
  exit 0
}

function Write-Log([string]$message) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
  Write-Host $line
  New-Item -ItemType Directory -Force (Split-Path -Parent $logFile) | Out-Null
  Add-Content -Path $logFile -Value $line
}

function Show-Notification([string]$message) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $icon = New-Object System.Windows.Forms.NotifyIcon
    $icon.Icon = [System.Drawing.SystemIcons]::Warning
    $icon.Visible = $true
    $icon.ShowBalloonTip(15000, "Read Frog sync", $message, "Warning")
    Start-Sleep -Seconds 15
    $icon.Dispose()
  } catch {
    # A notification is a courtesy; the log has the details.
  }
}

function Invoke-Step([string]$name, [scriptblock]$step) {
  $output = & $step 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    Add-Content -Path $logFile -Value $output
    throw "$name failed"
  }
}

Set-Location $repo

if ((git rev-parse --abbrev-ref HEAD) -ne "main") {
  Write-Log "Skipped: not on main."
  exit 0
}
if (git status --porcelain) {
  Write-Log "Skipped: the work tree has uncommitted changes."
  exit 0
}

if (-not (git remote | Where-Object { $_ -eq "upstream" })) {
  git remote add upstream $upstreamUrl
}

try {
  Invoke-Step "git fetch" { git fetch --quiet upstream main }
} catch {
  Write-Log "Skipped: could not reach upstream."
  exit 0
}

$before = git rev-parse HEAD
$behind = [int](git rev-list --count "HEAD..upstream/main")
$hasBuild = Test-Path (Join-Path $repo ".output\chrome-mv3\manifest.json")
if ($behind -eq 0 -and $hasBuild -and -not $Force) {
  Write-Log "Up to date."
  exit 0
}

$env:WXT_SKIP_ENV_VALIDATION = "true"
$merged = $false

try {
  if ($behind -gt 0) {
    git merge --no-edit upstream/main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $conflicts = (git diff --name-only --diff-filter=U) -join ", "
      git merge --abort
      throw "merge conflict in $conflicts"
    }
    $merged = $true
  }

  Invoke-Step "pnpm install" { pnpm install --frozen-lockfile }
  Invoke-Step "type check" { pnpm type-check }
  Invoke-Step "build" { pnpm build }

  Write-Log "Merged $behind upstream commit(s) and rebuilt. Restart Chrome or reload the extension to use it."

  # The build is what matters locally, so a push that fails is only logged.
  git push --quiet origin main 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Log "Pushed to origin."
  } else {
    Write-Log "Could not push to origin; the next sync tries again."
  }
} catch {
  $reason = $_.Exception.Message
  if ($merged) {
    # The work tree was clean when this started, so this only drops the merge.
    git reset --hard --quiet $before
    try {
      Invoke-Step "pnpm install" { pnpm install --frozen-lockfile }
      Invoke-Step "build" { pnpm build }
    } catch {
      $reason = "$reason; restoring the previous build also failed"
    }
  }
  Write-Log "Failed: $reason. The fork is back at $($before.Substring(0, 8))."
  Show-Notification "Could not sync with upstream: $reason. See .output\sync-upstream.log"
  exit 1
}
