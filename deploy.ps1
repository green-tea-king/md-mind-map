[CmdletBinding()]
param(
  [switch]$DryRun,
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedHead = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ExpectedRepoSlug = 'green-tea-king/md-mind-map'
$script:ExpectedBranch = 'master'
$script:LiveUrl = 'https://green-tea-king.github.io/md-mind-map/'
$script:CdpConnectTimeoutSeconds = 10
$script:CdpCloseTimeoutSeconds = 2
$script:CdpMinimumObservationMilliseconds = 2000
$script:CdpQuietWindowMilliseconds = 500
$script:CdpMaximumObservationMilliseconds = 5000
$script:ProtectedUntracked = @(
  'BACKUP_MANIFEST.md',
  'MD心智圖_v10_00.html',
  'agent.md',
  'clear-auto-draft.html',
  'design.md',
  'repository-history.bundle'
)

function Get-RemainingMilliseconds {
  param(
    [Parameter(Mandatory)][DateTime]$DeadlineUtc,
    [Parameter(Mandatory)][string]$Operation
  )
  $remaining = [int64][Math]::Floor(($DeadlineUtc - [DateTime]::UtcNow).TotalMilliseconds)
  if ($remaining -le 0) { throw [TimeoutException]::new("$Operation exceeded its total deadline.") }
  return [int][Math]::Min([int]::MaxValue, $remaining)
}

function Invoke-CheckedNative {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = $script:RepoRoot,
    [int]$TimeoutSeconds = 60,
    [int[]]$AllowedExitCodes = @(0)
  )
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FilePath
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$psi.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process | Add-Member -NotePropertyName Mk2mdStdOutTask -NotePropertyValue $stdoutTask -Force
  $process | Add-Member -NotePropertyName Mk2mdStdErrTask -NotePropertyValue $stderrTask -Force
  $deadline = if ($TimeoutSeconds -gt 0) { [DateTime]::UtcNow.AddSeconds($TimeoutSeconds) } else { [DateTime]::MaxValue }
  $timedOut = $false
  try {
    if ($TimeoutSeconds -gt 0) {
      $timedOut = -not $process.WaitForExit((Get-RemainingMilliseconds -DeadlineUtc $deadline -Operation "Native command $FilePath"))
    } else {
      $process.WaitForExit()
    }
  } catch [TimeoutException] { $timedOut = $true }
  if ($timedOut) {
    $primary = [TimeoutException]::new("Native command timed out after $TimeoutSeconds seconds: $FilePath $($Arguments -join ' ')")
    try { Stop-OwnedProcess -Process $process -Label "native command $FilePath" -DeadlineUtc $deadline } catch {
      $primary.Data['CleanupFailures'] = $_.Exception.Message
    }
    throw $primary
  }
  try {
    if (-not $stdoutTask.Wait((Get-RemainingMilliseconds -DeadlineUtc $deadline -Operation "Native stdout $FilePath"))) {
      throw [TimeoutException]::new("Native stdout timed out: $FilePath")
    }
    if (-not $stderrTask.Wait((Get-RemainingMilliseconds -DeadlineUtc $deadline -Operation "Native stderr $FilePath"))) {
      throw [TimeoutException]::new("Native stderr timed out: $FilePath")
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
  } catch [TimeoutException] {
    $primary = $_.Exception
    $process | Add-Member -NotePropertyName Mk2mdStdOutTask -NotePropertyValue $stdoutTask -Force
    $process | Add-Member -NotePropertyName Mk2mdStdErrTask -NotePropertyValue $stderrTask -Force
    try { Stop-OwnedProcess -Process $process -Label "native command $FilePath" -DeadlineUtc $deadline } catch {
      $primary.Data['CleanupFailures'] = $_.Exception.Message
    }
    throw $primary
  }
  $result = [pscustomobject]@{ ExitCode = $process.ExitCode; StdOut = $stdout; StdErr = $stderr }
  if ($result.ExitCode -notin $AllowedExitCodes) {
    throw "Native command failed ($($result.ExitCode)): $FilePath $($Arguments -join ' ')`n$stderr"
  }
  return $result
}

function Invoke-RepositoryNative {
  [CmdletBinding()]
  param(
    [scriptblock]$Native,
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$Arguments = @(),
    [Parameter(Mandatory)][string]$Repo,
    [int[]]$AllowedExitCodes = @(0),
    [int]$TimeoutSeconds = 60
  )
  if ($null -eq $Native) {
    return Invoke-CheckedNative -FilePath $FilePath -Arguments $Arguments `
      -WorkingDirectory $Repo -AllowedExitCodes $AllowedExitCodes -TimeoutSeconds $TimeoutSeconds
  }
  return & $Native $FilePath $Arguments $Repo $AllowedExitCodes $TimeoutSeconds
}

function Assert-ExactUntrackedSet {
  param([string[]]$Actual, [string[]]$Expected)
  $actualSorted = @($Actual | ForEach-Object { $_.Replace('\','/') } | Sort-Object)
  $expectedSorted = @($Expected | ForEach-Object { $_.Replace('\','/') } | Sort-Object)
  $difference = @(Compare-Object -ReferenceObject $expectedSorted -DifferenceObject $actualSorted)
  if ($difference.Count -gt 0) {
    throw "Unexpected untracked paths: $($difference | ForEach-Object { $_.InputObject + $_.SideIndicator } | Join-String -Separator ', ')"
  }
}

function Get-ProtectedSnapshot {
  param([string]$Repo, [string[]]$Paths)
  $snapshot = [ordered]@{}
  foreach ($path in $Paths) {
    $fullPath = Join-Path $Repo $path
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { throw "Protected file missing: $path" }
    $snapshot[$path] = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash
  }
  return $snapshot
}

function Assert-ProtectedSnapshot {
  param([Collections.IDictionary]$Before, [Collections.IDictionary]$After)
  if ($Before.Count -ne $After.Count) { throw 'Protected snapshot path count changed.' }
  foreach ($path in $Before.Keys) {
    if (-not $After.Contains($path) -or $After[$path] -ne $Before[$path]) {
      throw "Protected file changed: $path"
    }
  }
}

function Resolve-RemoteRelation {
  param([string]$LocalHead, [string]$RemoteHead, [bool]$RemoteIsAncestor, [bool]$LocalIsAncestor)
  if ($LocalHead -eq $RemoteHead) { return 'equal' }
  if ($RemoteIsAncestor) { return 'local-ahead' }
  if ($LocalIsAncestor) { return 'remote-ahead' }
  return 'diverged'
}

function Assert-ExpectedHead {
  param([string]$Actual, [string]$Expected, [Alias('IsDryRun')][bool]$DryRun)
  if ($DryRun) { return }
  if ($Expected -notmatch '^[0-9a-fA-F]{40}$' -or $Actual -ne $Expected.ToLowerInvariant()) {
    throw "ExpectedHead must equal local HEAD: $Actual"
  }
}

function Get-FreeLoopbackPort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Get-InstalledChromePath {
  $candidates = [Collections.Generic.List[string]]::new()
  foreach ($candidate in @(
    @{ Root = $env:ProgramFiles; Relative = 'Google\Chrome\Application\chrome.exe' },
    @{ Root = ${env:ProgramFiles(x86)}; Relative = 'Google\Chrome\Application\chrome.exe' },
    @{ Root = $env:LOCALAPPDATA; Relative = 'Google\Chrome\Application\chrome.exe' }
  )) {
    if ($candidate.Root) { $candidates.Add((Join-Path $candidate.Root $candidate.Relative)) }
  }
  foreach ($commandName in @('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'chrome.exe')) {
    $command = Get-Command $commandName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command) { $candidates.Add($command.Source) }
  }

  $chromePath = $candidates | Select-Object -Unique | Where-Object {
    Test-Path -LiteralPath $_ -PathType Leaf
  } | Select-Object -First 1
  if (-not $chromePath) { throw 'Installed Google Chrome or Chromium was not found.' }
  return $chromePath
}

function New-OwnedChromeProfile {
  param([scriptblock]$MarkerWriter)

  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd(
    [char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  )
  $token = [Guid]::NewGuid().ToString('N')
  $profilePath = [IO.Path]::GetFullPath((Join-Path $tempRoot "mk2md-chrome-$token"))
  if (Test-Path -LiteralPath $profilePath) { throw "Owned Chrome profile already exists: $profilePath" }

  [void][IO.Directory]::CreateDirectory($profilePath)
  $markerPath = Join-Path $profilePath '.mk2md-owned-profile'
  if ($null -eq $MarkerWriter) {
    $MarkerWriter = {
      param($path, $value)
      [IO.File]::WriteAllText($path, $value, [Text.UTF8Encoding]::new($false))
    }
  }
  try {
    & $MarkerWriter $markerPath $token
  } catch {
    $profile = [pscustomobject]@{
      Path = $profilePath
      TempRoot = $tempRoot
      Token = $token
      MarkerPath = $markerPath
    }
    $_.Exception.Data['Profile'] = $profile
    $_.Exception.Data['CleanupEvidence'] =
      "Chrome profile directory preserved because ownership marker creation failed: $profilePath"
    throw
  }
  return [pscustomobject]@{
    Path = $profilePath
    TempRoot = $tempRoot
    Token = $token
    MarkerPath = $markerPath
  }
}

function Assert-PlainOwnedChromeProfileDirectory {
  param(
    [Parameter(Mandatory)][object]$ProfileItem,
    [Parameter(Mandatory)][string]$ProfilePath
  )
  if (-not $ProfileItem.PSIsContainer -or
      ($ProfileItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Refusing to remove a non-directory or reparse-point Chrome profile: $ProfilePath"
  }
}

function Remove-OwnedChromeProfile {
  param([Parameter(Mandatory)][object]$Profile)

  foreach ($property in @('Path', 'TempRoot', 'Token', 'MarkerPath')) {
    if (-not ($Profile.PSObject.Properties.Name -contains $property) -or -not [string]$Profile.$property) {
      throw "Owned Chrome profile metadata is missing: $property"
    }
  }

  $trimChars = [char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  $expectedTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd($trimChars)
  $recordedTempRoot = [IO.Path]::GetFullPath([string]$Profile.TempRoot).TrimEnd($trimChars)
  $profilePath = [IO.Path]::GetFullPath([string]$Profile.Path).TrimEnd($trimChars)
  $profileParent = [IO.Directory]::GetParent($profilePath).FullName.TrimEnd($trimChars)
  $profileLeaf = [IO.Path]::GetFileName($profilePath)
  $token = [string]$Profile.Token
  $expectedMarker = [IO.Path]::GetFullPath((Join-Path $profilePath '.mk2md-owned-profile'))
  $recordedMarker = [IO.Path]::GetFullPath([string]$Profile.MarkerPath)
  $pathComparison = if ($IsWindows) {
    [StringComparison]::OrdinalIgnoreCase
  } else {
    [StringComparison]::Ordinal
  }

  if (-not [string]::Equals($recordedTempRoot, $expectedTempRoot, $pathComparison) -or
      -not [string]::Equals($profileParent, $expectedTempRoot, $pathComparison) -or
      $token -notmatch '^[0-9a-f]{32}$' -or
      -not [string]::Equals($profileLeaf, "mk2md-chrome-$token", $pathComparison) -or
      -not [string]::Equals($recordedMarker, $expectedMarker, $pathComparison)) {
    throw "Refusing to remove a path that is not this run's owned Chrome profile: $profilePath"
  }
  if (-not (Test-Path -LiteralPath $profilePath)) { return }

  $resolvedPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $profilePath -ErrorAction Stop).Path).TrimEnd($trimChars)
  if (-not [string]::Equals($resolvedPath, $profilePath, $pathComparison)) {
    throw "Refusing to remove a redirected owned Chrome profile: $profilePath"
  }
  $profileItem = Get-Item -LiteralPath $profilePath -Force -ErrorAction Stop
  Assert-PlainOwnedChromeProfileDirectory -ProfileItem $profileItem -ProfilePath $profilePath
  if (-not (Test-Path -LiteralPath $expectedMarker -PathType Leaf)) {
    throw "Owned Chrome profile marker is missing: $expectedMarker"
  }
  $markerToken = [IO.File]::ReadAllText($expectedMarker, [Text.Encoding]::UTF8)
  if ($markerToken -ne $token) { throw "Owned Chrome profile marker does not match: $expectedMarker" }

  for ($attempt = 1; $attempt -le 20; $attempt++) {
    try {
      [IO.Directory]::Delete($profilePath, $true)
      break
    } catch [IO.IOException] {
      if ($attempt -eq 20) { throw }
    } catch [UnauthorizedAccessException] {
      if ($attempt -eq 20) { throw }
    }
    Start-Sleep -Milliseconds 100
  }
  if (Test-Path -LiteralPath $profilePath) { throw "Owned Chrome profile was not removed: $profilePath" }
}

function New-ChromeObservationTimeoutException {
  param([Parameter(Mandatory)][DateTime]$ObservationStartedAt)

  $elapsedMilliseconds = [int64][Math]::Ceiling(
    ([DateTime]::UtcNow - $ObservationStartedAt).TotalMilliseconds
  )
  $exception = [TimeoutException]::new(
    "Chrome CDP observation did not reach a $($script:CdpQuietWindowMilliseconds)ms quiet window within $($script:CdpMaximumObservationMilliseconds)ms; observation elapsed ${elapsedMilliseconds}ms."
  )
  $exception.Data['ObservationElapsedMilliseconds'] = $elapsedMilliseconds
  $exception.Data['ObservationMaximumMilliseconds'] = $script:CdpMaximumObservationMilliseconds
  return $exception
}

function Throw-ChromeFailure {
  param(
    [Exception]$PrimaryException = $null,
    [string[]]$CleanupFailures = @()
  )

  $failures = @($CleanupFailures | Where-Object { $_ })
  if ($null -ne $PrimaryException) {
    if ($failures.Count -gt 0) {
      $PrimaryException.Data['CleanupFailures'] = $failures -join '; '
    }
    throw $PrimaryException
  }
  if ($failures.Count -gt 0) { throw "Chrome cleanup failed: $($failures -join '; ')" }
}

function Stop-OwnedProcess {
  param(
    [Parameter(Mandatory)][Diagnostics.Process]$Process,
    [Parameter(Mandatory)][string]$Label,
    [DateTime]$DeadlineUtc = [DateTime]::UtcNow.AddSeconds(10)
  )

  $portProperty = $Process.PSObject.Properties['Mk2mdOwnedPort']
  $ownedPort = if ($null -ne $portProperty) { [int]$portProperty.Value } else { 0 }
  $cleanupFailures = [Collections.Generic.List[string]]::new()
  try {
    $Process.Refresh()
    if (-not $Process.HasExited) {
      $Process.Kill($true)
      $remaining = Get-RemainingMilliseconds -DeadlineUtc $DeadlineUtc -Operation "Stopping $Label process"
      if (-not $Process.WaitForExit($remaining)) {
        throw "Timed out stopping $Label process $($Process.Id)."
      }
    } else {
      $remaining = Get-RemainingMilliseconds -DeadlineUtc $DeadlineUtc -Operation "Waiting for $Label process"
      if (-not $Process.WaitForExit($remaining)) { throw "Timed out waiting for $Label process $($Process.Id)." }
    }
  } catch { $cleanupFailures.Add($_.Exception.Message) }

  foreach ($taskName in @('Mk2mdStdOutTask', 'Mk2mdStdErrTask')) {
    $taskProperty = $Process.PSObject.Properties[$taskName]
    if ($null -ne $taskProperty) {
      try {
        $remaining = Get-RemainingMilliseconds -DeadlineUtc $DeadlineUtc -Operation "$Label $taskName"
        if (-not $taskProperty.Value.Wait($remaining)) { throw "$Label $taskName did not finish before cleanup deadline." }
        [void]$taskProperty.Value.GetAwaiter().GetResult()
      } catch { $cleanupFailures.Add($_.Exception.Message) }
    }
  }

  if ($ownedPort -gt 0) {
    $released = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
      $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
      if (-not ($listeners | Where-Object Port -eq $ownedPort)) {
        $released = $true
        break
      }
      try {
        $remaining = Get-RemainingMilliseconds -DeadlineUtc $DeadlineUtc -Operation "$Label port cleanup"
        Start-Sleep -Milliseconds ([Math]::Min(100, $remaining))
      } catch { $cleanupFailures.Add($_.Exception.Message); break }
    }
    if (-not $released) { $cleanupFailures.Add("$Label stopped, but port $ownedPort still has a listener.") }
  }
  if ($cleanupFailures.Count -gt 0) { throw ($cleanupFailures -join '; ') }
}

function Start-LocalSiteServer {
  param([Parameter(Mandatory)][string]$Repo)

  $repoPath = (Resolve-Path -LiteralPath $Repo -ErrorAction Stop).Path
  $python = (Get-Command python -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $port = Get-FreeLoopbackPort
  $url = "http://127.0.0.1:$port/index.html"
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $python
  $psi.WorkingDirectory = $repoPath
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($argument in @('-m', 'http.server', [string]$port, '--bind', '127.0.0.1')) {
    [void]$psi.ArgumentList.Add($argument)
  }

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()
  $process | Add-Member -NotePropertyName Mk2mdOwnedPort -NotePropertyValue $port
  $process | Add-Member -NotePropertyName Mk2mdStdOutTask -NotePropertyValue $process.StandardOutput.ReadToEndAsync()
  $process | Add-Member -NotePropertyName Mk2mdStdErrTask -NotePropertyValue $process.StandardError.ReadToEndAsync()

  $handler = [Net.Http.HttpClientHandler]::new()
  $handler.UseProxy = $false
  $client = [Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(2)
  try {
    for ($attempt = 1; $attempt -le 40; $attempt++) {
      $process.Refresh()
      if ($process.HasExited) { throw "Local HTTP server exited with code $($process.ExitCode)." }
      try {
        $response = $client.GetAsync($url).GetAwaiter().GetResult()
        try {
          if ($response.StatusCode -eq [Net.HttpStatusCode]::OK) {
            return [pscustomobject]@{ Process = $process; Port = $port; Url = $url }
          }
        } finally {
          $response.Dispose()
        }
      } catch [Net.Http.HttpRequestException] {
        if ($attempt -eq 40) { throw }
      } catch [Threading.Tasks.TaskCanceledException] {
        if ($attempt -eq 40) { throw }
      }
      Start-Sleep -Milliseconds 250
    }
    throw "Local HTTP server did not return HTTP 200 at $url."
  } catch {
    Stop-OwnedProcess -Process $process -Label 'local HTTP server'
    throw
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

function Receive-CdpMessage {
  param(
    [Parameter(Mandatory)][Net.WebSockets.ClientWebSocket]$WebSocket,
    [int]$TimeoutSeconds = 10,
    [int]$TimeoutMilliseconds = 0
  )

  $effectiveTimeoutMilliseconds = if ($PSBoundParameters.ContainsKey('TimeoutMilliseconds')) {
    $TimeoutMilliseconds
  } else {
    $TimeoutSeconds * 1000
  }
  if ($effectiveTimeoutMilliseconds -le 0) { throw 'CDP receive timeout must be positive.' }
  $buffer = [byte[]]::new(65536)
  $stream = [IO.MemoryStream]::new()
  $cancellation = [Threading.CancellationTokenSource]::new(
    [TimeSpan]::FromMilliseconds($effectiveTimeoutMilliseconds)
  )
  try {
    do {
      $segment = [ArraySegment[byte]]::new($buffer)
      $received = $WebSocket.ReceiveAsync($segment, $cancellation.Token).GetAwaiter().GetResult()
      if ($received.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) {
        throw 'Chrome closed the CDP WebSocket unexpectedly.'
      }
      $stream.Write($buffer, 0, $received.Count)
    } until ($received.EndOfMessage)
    $json = [Text.Encoding]::UTF8.GetString($stream.ToArray())
    return ($json | ConvertFrom-Json -Depth 30)
  } catch [OperationCanceledException] {
    throw "Timed out waiting $effectiveTimeoutMilliseconds milliseconds for a CDP message."
  } finally {
    $cancellation.Dispose()
    $stream.Dispose()
  }
}

function Wait-CdpCommandResponse {
  param(
    [Parameter(Mandatory)][int64]$Id,
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][DateTime]$DeadlineUtc,
    [Collections.IList]$EventSink = $null,
    [Parameter(Mandatory)][scriptblock]$ReceiveMessage
  )

  while ($true) {
    $remainingMilliseconds = [int][Math]::Ceiling(($DeadlineUtc - [DateTime]::UtcNow).TotalMilliseconds)
    if ($remainingMilliseconds -le 0) {
      throw "CDP command exceeded its total deadline: $Method"
    }
    try {
      $incoming = & $ReceiveMessage $remainingMilliseconds
    } catch {
      if ([DateTime]::UtcNow -ge $DeadlineUtc) {
        throw "CDP command exceeded its total deadline: $Method"
      }
      throw
    }
    if ([DateTime]::UtcNow -ge $DeadlineUtc) {
      throw "CDP command exceeded its total deadline: $Method"
    }
    if ($incoming.PSObject.Properties.Name -contains 'method') {
      if ($null -ne $EventSink) { [void]$EventSink.Add($incoming) }
      continue
    }
    if (($incoming.PSObject.Properties.Name -contains 'id') -and [int64]$incoming.id -eq $Id) {
      if ($incoming.PSObject.Properties.Name -contains 'error') {
        throw "CDP command failed ($Method): $($incoming.error | ConvertTo-Json -Compress -Depth 10)"
      }
      return $incoming
    }
  }
}

function Invoke-CdpCommand {
  param(
    [Parameter(Mandatory)][Net.WebSockets.ClientWebSocket]$WebSocket,
    [Parameter(Mandatory)][string]$Method,
    [object]$Params = $null,
    [Collections.IList]$EventSink = $null,
    [int]$TimeoutSeconds = 10,
    [DateTime]$DeadlineUtc = [DateTime]::MaxValue
  )

  if ($TimeoutSeconds -le 0) { throw 'CDP command timeout must be positive.' }
  $commandDeadlineUtc = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  if ($DeadlineUtc -lt $commandDeadlineUtc) { $commandDeadlineUtc = $DeadlineUtc }
  if ($null -eq (Get-Variable CdpNextId -Scope Script -ErrorAction SilentlyContinue)) {
    $script:CdpNextId = 0
  }
  $script:CdpNextId++
  $id = $script:CdpNextId
  $message = [ordered]@{ id = $id; method = $Method }
  if ($null -ne $Params) { $message.params = $Params }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($message | ConvertTo-Json -Compress -Depth 30))
  $sendRemainingMilliseconds = [int][Math]::Ceiling(($commandDeadlineUtc - [DateTime]::UtcNow).TotalMilliseconds)
  if ($sendRemainingMilliseconds -le 0) { throw "CDP command exceeded its total deadline: $Method" }
  $cancellation = [Threading.CancellationTokenSource]::new(
    [TimeSpan]::FromMilliseconds($sendRemainingMilliseconds)
  )
  try {
    $segment = [ArraySegment[byte]]::new($bytes)
    [void]$WebSocket.SendAsync(
      $segment,
      [Net.WebSockets.WebSocketMessageType]::Text,
      $true,
      $cancellation.Token
    ).GetAwaiter().GetResult()
  } catch [OperationCanceledException] {
    throw "CDP command exceeded its total deadline while sending: $Method"
  } finally {
    $cancellation.Dispose()
  }

  $receiveMessage = {
    param([int]$RemainingMilliseconds)
    Receive-CdpMessage -WebSocket $WebSocket -TimeoutMilliseconds $RemainingMilliseconds
  }
  return Wait-CdpCommandResponse -Id $id -Method $Method -DeadlineUtc $commandDeadlineUtc `
    -EventSink $EventSink -ReceiveMessage $receiveMessage
}

function Invoke-ChromeSelfTest {
  param(
    [Parameter(Mandatory)][uri]$Url,
    [Parameter(Mandatory)][string]$ExpectedVersion,
    [Parameter(Mandatory)][string]$ExpectedDate
  )

  $chromePath = Get-InstalledChromePath

  $debugPort = Get-FreeLoopbackPort
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $chromePath
  $psi.WorkingDirectory = $script:RepoRoot
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  foreach ($argument in @(
    '--headless=new',
    "--remote-debugging-port=$debugPort",
    '--remote-debugging-address=127.0.0.1',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-background-timer-throttling'
  )) { [void]$psi.ArgumentList.Add($argument) }

  $chrome = [Diagnostics.Process]::new()
  $chrome.StartInfo = $psi
  $handler = [Net.Http.HttpClientHandler]::new()
  $handler.UseProxy = $false
  $client = [Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(2)
  $socket = [Net.WebSockets.ClientWebSocket]::new()
  $ownedProfile = $null
  $chromeStarted = $false
  $browserResult = $null
  $primaryException = $null
  $cleanupFailures = [Collections.Generic.List[string]]::new()
  try {
    $ownedProfile = New-OwnedChromeProfile
    $userDataArgument = "--user-data-dir=$($ownedProfile.Path)"
    [void]$psi.ArgumentList.Add($userDataArgument)
    [void]$psi.ArgumentList.Add('about:blank')

    [void]$chrome.Start()
    $chromeStarted = $true
    $chrome | Add-Member -NotePropertyName Mk2mdOwnedPort -NotePropertyValue $debugPort
    $chrome | Add-Member -NotePropertyName Mk2mdStdOutTask -NotePropertyValue $chrome.StandardOutput.ReadToEndAsync()
    $chrome | Add-Member -NotePropertyName Mk2mdStdErrTask -NotePropertyValue $chrome.StandardError.ReadToEndAsync()

    $debugBase = "http://127.0.0.1:$debugPort"
    $versionReady = $false
    for ($attempt = 1; $attempt -le 60; $attempt++) {
      $chrome.Refresh()
      if ($chrome.HasExited) { throw "Chrome exited with code $($chrome.ExitCode) before CDP became ready." }
      try {
        [void]$client.GetStringAsync("$debugBase/json/version").GetAwaiter().GetResult()
        $versionReady = $true
        break
      } catch [Net.Http.HttpRequestException] {
      } catch [Threading.Tasks.TaskCanceledException] {
      }
      Start-Sleep -Milliseconds 250
    }
    if (-not $versionReady) { throw "Chrome CDP did not become ready on loopback port $debugPort." }
    $profileEntries = @(Get-ChildItem -LiteralPath $ownedProfile.Path -Force -ErrorAction Stop | Where-Object {
      -not [string]::Equals($_.FullName, $ownedProfile.MarkerPath, [StringComparison]::OrdinalIgnoreCase)
    })
    $chromeProfileUsed = ($psi.ArgumentList -contains $userDataArgument) -and $profileEntries.Count -gt 0
    if (-not $chromeProfileUsed) { throw "Chrome did not use its owned profile: $($ownedProfile.Path)" }

    $encodedUrl = [uri]::EscapeDataString($Url.AbsoluteUri)
    $targetRequest = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Put, "$debugBase/json/new?$encodedUrl")
    try {
      $targetResponse = $client.Send($targetRequest)
      try {
        [void]$targetResponse.EnsureSuccessStatusCode()
        $target = $targetResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
      } finally {
        $targetResponse.Dispose()
      }
    } finally {
      $targetRequest.Dispose()
    }
    if (-not $target.webSocketDebuggerUrl) { throw 'Chrome did not return a page CDP WebSocket URL.' }

    $connectCancellation = [Threading.CancellationTokenSource]::new(
      [TimeSpan]::FromSeconds($script:CdpConnectTimeoutSeconds)
    )
    try {
      [void]$socket.ConnectAsync(
        [uri]$target.webSocketDebuggerUrl,
        $connectCancellation.Token
      ).GetAwaiter().GetResult()
    } catch [OperationCanceledException] {
      throw "Chrome CDP WebSocket connect timed out after $($script:CdpConnectTimeoutSeconds) seconds."
    } finally {
      $connectCancellation.Dispose()
    }
    $events = [Collections.ArrayList]::new()
    [void](Invoke-CdpCommand -WebSocket $socket -Method 'Runtime.enable' -Params @{} -EventSink $events)
    [void](Invoke-CdpCommand -WebSocket $socket -Method 'Log.enable' -Params @{} -EventSink $events)
    [void](Invoke-CdpCommand -WebSocket $socket -Method 'Page.enable' -Params @{} -EventSink $events)
    $events.Clear()
    [void](Invoke-CdpCommand -WebSocket $socket -Method 'Page.reload' -Params @{ ignoreCache = $true } -EventSink $events)

    $expression = @'
JSON.stringify({
  title: document.title,
  brand: document.querySelector('#brandName')?.textContent?.trim() || '',
  versionText: document.querySelector('#appVersion')?.textContent?.trim() || '',
  selfTest: document.documentElement.dataset.ciSelfTest || '',
  passed: Number(document.documentElement.dataset.ciSelfTestPassed || 0),
  failed: Number(document.documentElement.dataset.ciSelfTestFailed || 0),
  detail: document.documentElement.dataset.ciSelfTestDetail || ''
})
'@
    $dom = $null
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while ([DateTime]::UtcNow -lt $deadline) {
      try {
        $evaluation = Invoke-CdpCommand -WebSocket $socket -Method 'Runtime.evaluate' -Params @{
          expression = $expression
          returnByValue = $true
        } -EventSink $events -DeadlineUtc $deadline
      } catch {
        if ($_.Exception.Message -notmatch 'Inspected target navigated or closed') { throw }
        $remainingMilliseconds = Get-RemainingMilliseconds -DeadlineUtc $deadline -Operation 'Chrome self-test DOM loop'
        Start-Sleep -Milliseconds ([Math]::Min(250, $remainingMilliseconds))
        continue
      }
      [void](Get-RemainingMilliseconds -DeadlineUtc $deadline -Operation 'Chrome self-test DOM loop')
      $value = $evaluation.result.result.value
      if ($value) {
        $dom = $value | ConvertFrom-Json
        if ($dom.selfTest -in @('pass', 'fail')) { break }
      }
      $remainingMilliseconds = Get-RemainingMilliseconds -DeadlineUtc $deadline -Operation 'Chrome self-test DOM loop'
      Start-Sleep -Milliseconds ([Math]::Min(250, $remainingMilliseconds))
    }
    if ($null -eq $dom -or $dom.selfTest -notin @('pass', 'fail')) {
      throw "Chrome self-test did not finish within 90 seconds for MK2MD v$ExpectedVersion ($ExpectedDate)."
    }

    $observationStopwatch = [Diagnostics.Stopwatch]::StartNew()
    $observationStartedAt = [DateTime]::UtcNow
    $minimumObservationDeadline = $observationStartedAt.AddMilliseconds(
      $script:CdpMinimumObservationMilliseconds
    )
    $observationDeadline = $observationStartedAt.AddMilliseconds(
      $script:CdpMaximumObservationMilliseconds
    )
    $lastDiagnosticEventAt = $observationStartedAt
    $diagnosticEventCount = @($events | Where-Object {
      ($_.method -eq 'Runtime.consoleAPICalled' -and $_.params.type -in @('error', 'warning')) -or
      ($_.method -eq 'Log.entryAdded' -and $_.params.entry.level -in @('error', 'warning')) -or
      $_.method -eq 'Runtime.exceptionThrown'
    }).Count

    while ($true) {
      $remainingMilliseconds = [int][Math]::Floor(
        ($observationDeadline - [DateTime]::UtcNow).TotalMilliseconds
      )
      if ($remainingMilliseconds -le 0) {
        throw (New-ChromeObservationTimeoutException -ObservationStartedAt $observationStartedAt)
      }
      Start-Sleep -Milliseconds ([Math]::Min(100, $remainingMilliseconds))
      if ([DateTime]::UtcNow -ge $observationDeadline) {
        throw (New-ChromeObservationTimeoutException -ObservationStartedAt $observationStartedAt)
      }
      try {
        $evaluation = Invoke-CdpCommand -WebSocket $socket -Method 'Runtime.evaluate' -Params @{
          expression = $expression
          returnByValue = $true
        } -EventSink $events -TimeoutSeconds 2 -DeadlineUtc $observationDeadline
      } catch {
        if ([DateTime]::UtcNow -ge $observationDeadline) {
          throw (New-ChromeObservationTimeoutException -ObservationStartedAt $observationStartedAt)
        }
        throw
      }
      $value = $evaluation.result.result.value
      if (-not $value) { throw 'Chrome returned no DOM state during the CDP observation window.' }
      $dom = $value | ConvertFrom-Json

      $newDiagnosticEventCount = @($events | Where-Object {
        ($_.method -eq 'Runtime.consoleAPICalled' -and $_.params.type -in @('error', 'warning')) -or
        ($_.method -eq 'Log.entryAdded' -and $_.params.entry.level -in @('error', 'warning')) -or
        $_.method -eq 'Runtime.exceptionThrown'
      }).Count
      if ($newDiagnosticEventCount -gt $diagnosticEventCount) {
        $lastDiagnosticEventAt = [DateTime]::UtcNow
        $diagnosticEventCount = $newDiagnosticEventCount
      }

      $now = [DateTime]::UtcNow
      $minimumObserved = $now -ge $minimumObservationDeadline
      $quietObserved = ($now - $lastDiagnosticEventAt).TotalMilliseconds -ge `
        $script:CdpQuietWindowMilliseconds
      if ($minimumObserved -and $quietObserved) {
        $observationStopwatch.Stop()
        break
      }
    }

    $consoleErrors = [Collections.Generic.List[string]]::new()
    $pageErrors = [Collections.Generic.List[string]]::new()
    $warnings = [Collections.Generic.List[string]]::new()
    foreach ($event in $events) {
      if ($event.method -eq 'Runtime.consoleAPICalled' -and $event.params.type -in @('error', 'warning')) {
        $parts = @($event.params.args | ForEach-Object {
          if ($_.PSObject.Properties.Name -contains 'value') { [string]$_.value }
          elseif ($_.PSObject.Properties.Name -contains 'description') { [string]$_.description }
          else { [string]$_.type }
        })
        $text = $parts -join ' '
        if ($event.params.type -eq 'error') { $consoleErrors.Add($text) }
        else { $warnings.Add($text) }
      } elseif ($event.method -eq 'Log.entryAdded' -and $event.params.entry.level -in @('error', 'warning')) {
        $text = [string]$event.params.entry.text
        if ($event.params.entry.level -eq 'error') { $consoleErrors.Add($text) }
        else { $warnings.Add($text) }
      } elseif ($event.method -eq 'Runtime.exceptionThrown') {
        $details = $event.params.exceptionDetails
        if (($details.PSObject.Properties.Name -contains 'exception') -and
            ($details.exception.PSObject.Properties.Name -contains 'description')) {
          $pageErrors.Add([string]$details.exception.description)
        } else {
          $pageErrors.Add([string]$details.text)
        }
      }
    }

    $browserResult = [pscustomobject]@{
      Title = [string]$dom.title
      Brand = [string]$dom.brand
      VersionText = [string]$dom.versionText
      SelfTest = [string]$dom.selfTest
      Detail = [string]$dom.detail
      Passed = [int]$dom.passed
      Failed = [int]$dom.failed
      ConsoleErrors = @($consoleErrors)
      PageErrors = @($pageErrors)
      Warnings = @($warnings)
      ObservationElapsedMilliseconds = $observationStopwatch.ElapsedMilliseconds
      ChromeProfilePath = $ownedProfile.Path
      ChromeProfileUsed = $chromeProfileUsed
    }
  } catch {
    $primaryException = $_.Exception
  } finally {
    if ($socket.State -eq [Net.WebSockets.WebSocketState]::Open) {
      $closeCancellation = [Threading.CancellationTokenSource]::new(
        [TimeSpan]::FromSeconds($script:CdpCloseTimeoutSeconds)
      )
      try {
        [void]$socket.CloseAsync(
          [Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
          'complete',
          $closeCancellation.Token
        ).GetAwaiter().GetResult()
      } catch [OperationCanceledException] {
        $cleanupFailures.Add(
          "Chrome CDP WebSocket close timed out after $($script:CdpCloseTimeoutSeconds) seconds."
        )
        try { $socket.Abort() } catch {
          $cleanupFailures.Add("Chrome CDP WebSocket abort failed: $($_.Exception.Message)")
        }
      } catch {
        $cleanupFailures.Add("Chrome CDP WebSocket close failed: $($_.Exception.Message)")
        try { $socket.Abort() } catch {
          $cleanupFailures.Add("Chrome CDP WebSocket abort failed: $($_.Exception.Message)")
        }
      } finally {
        try { $closeCancellation.Dispose() } catch {
          $cleanupFailures.Add("Chrome CDP close cancellation disposal failed: $($_.Exception.Message)")
        }
      }
    }
    try { $socket.Dispose() } catch {
      $cleanupFailures.Add("Chrome CDP WebSocket disposal failed: $($_.Exception.Message)")
    }
    try { $client.Dispose() } catch {
      $cleanupFailures.Add("Chrome HTTP client disposal failed: $($_.Exception.Message)")
    }
    try { $handler.Dispose() } catch {
      $cleanupFailures.Add("Chrome HTTP handler disposal failed: $($_.Exception.Message)")
    }
    if ($chromeStarted) {
      try { Stop-OwnedProcess -Process $chrome -Label 'headless Chrome' } catch {
        $cleanupFailures.Add("Chrome process cleanup failed: $($_.Exception.Message)")
      }
    }
    if ($null -ne $ownedProfile) {
      try { Remove-OwnedChromeProfile -Profile $ownedProfile } catch {
        $cleanupFailures.Add("Chrome profile cleanup failed: $($_.Exception.Message)")
      }
    }
  }
  Throw-ChromeFailure -PrimaryException $primaryException -CleanupFailures @($cleanupFailures)
  return $browserResult
}

function Assert-BrowserResult {
  param(
    [Parameter(Mandatory, Position=0)][object]$Result,
    [Parameter(Mandatory, Position=1)][string]$Version,
    [Parameter(Mandatory, Position=2)][string]$Date
  )

  $problems = [Collections.Generic.List[string]]::new()
  if ($Result.Title -ne "MK2MD v$Version") { $problems.Add("title '$($Result.Title)'") }
  if ($Result.Brand -ne 'MK2MD') { $problems.Add("brand '$($Result.Brand)'") }
  if ($Result.VersionText -ne "v$Version · $Date") { $problems.Add("version text '$($Result.VersionText)'") }
  if ([string]$Result.SelfTest -ne 'pass') {
    $detail = [string]$Result.Detail
    $problems.Add("self-test status '$($Result.SelfTest)'$(if ($detail) { ": $detail" })")
  }
  if ([int]$Result.Passed -ne 11 -or [int]$Result.Failed -ne 0) {
    $problems.Add("self-test $($Result.Passed)/11 with $($Result.Failed) failed")
  }
  if (@($Result.ConsoleErrors).Count -ne 0) { $problems.Add("$(@($Result.ConsoleErrors).Count) console errors") }
  if (@($Result.PageErrors).Count -ne 0) { $problems.Add("$(@($Result.PageErrors).Count) page errors") }
  if (@($Result.Warnings).Count -gt 6) { $problems.Add("$(@($Result.Warnings).Count) warnings") }
  if ($problems.Count -gt 0) { throw "Browser preflight failed: $($problems -join '; ')." }
}

function ConvertTo-RepositorySlug {
  param([Parameter(Mandatory)][string]$RemoteUrl)

  $value = $RemoteUrl.Trim()
  if ($value -match '^https://github\.com/(?<slug>[^/]+/[^/]+?)(?:\.git)?$') {
    return $Matches.slug
  }
  if ($value -match '^git@github\.com:(?<slug>[^/]+/[^/]+?)(?:\.git)?$') {
    return $Matches.slug
  }
  if ($value -match '^ssh://git@github\.com/(?<slug>[^/]+/[^/]+?)(?:\.git)?$') {
    return $Matches.slug
  }
  throw "Unsupported origin URL: $value"
}

function Assert-RepositorySlug {
  param([Parameter(Mandatory)][string]$Slug)
  if ($Slug -ne $script:ExpectedRepoSlug) {
    throw "Deployment origin must be $($script:ExpectedRepoSlug), got $Slug."
  }
}

function Get-RemoteIdentity {
  [CmdletBinding()]
  param(
    [string]$Repo = $script:RepoRoot,
    [scriptblock]$Native
  )

  $fetchUrls = @((Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('remote', 'get-url', '--all', 'origin') -Repo $Repo).StdOut -split "`r?`n" |
    ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($fetchUrls.Count -ne 1) {
    throw "origin must have exactly one fetch URL, got $($fetchUrls.Count)."
  }

  $pushUrls = @((Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('remote', 'get-url', '--push', '--all', 'origin') -Repo $Repo).StdOut -split "`r?`n" |
    ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($pushUrls.Count -ne 1) {
    throw "origin must have exactly one push URL, got $($pushUrls.Count)."
  }

  $fetchSlug = ConvertTo-RepositorySlug -RemoteUrl $fetchUrls[0]
  $pushSlug = ConvertTo-RepositorySlug -RemoteUrl $pushUrls[0]
  Assert-RepositorySlug -Slug $fetchSlug
  Assert-RepositorySlug -Slug $pushSlug
  if ($fetchSlug -ne $pushSlug) { throw "Fetch and push repository identities differ: $fetchSlug / $pushSlug." }

  return [pscustomobject]@{
    FetchUrl = $fetchUrls[0]
    PushUrl = $pushUrls[0]
    Slug = $fetchSlug
  }
}

function Get-RepositoryContext {
  [CmdletBinding()]
  param(
    [string]$Repo = $script:RepoRoot,
    [scriptblock]$Native,
    [scriptblock]$SnapshotProvider
  )

  if ($null -eq $SnapshotProvider) {
    $SnapshotProvider = { param($repoPath, $protectedPaths) Get-ProtectedSnapshot -Repo $repoPath -Paths $protectedPaths }
  }

  $branch = (Invoke-RepositoryNative -Native $Native -FilePath 'git' -Arguments @('branch', '--show-current') -Repo $Repo).StdOut.Trim()
  if ($branch -ne $script:ExpectedBranch) { throw "Deployment branch must be $($script:ExpectedBranch), got $branch." }

  $remoteIdentity = Get-RemoteIdentity -Repo $Repo -Native $Native

  $workingDiff = Invoke-RepositoryNative -Native $Native -FilePath 'git' -Arguments @('diff', '--quiet') `
    -Repo $Repo -AllowedExitCodes @(0, 1)
  if ($workingDiff.ExitCode -ne 0) { throw 'Tracked working-tree changes must be committed before deployment.' }
  $stagedDiff = Invoke-RepositoryNative -Native $Native -FilePath 'git' -Arguments @('diff', '--cached', '--quiet') `
    -Repo $Repo -AllowedExitCodes @(0, 1)
  if ($stagedDiff.ExitCode -ne 0) { throw 'Staged changes must be committed before deployment.' }

  $statusLines = @((Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-uall') -Repo $Repo).StdOut `
    -split "`r?`n" | Where-Object { $_ })
  $trackedStatus = @($statusLines | Where-Object { -not $_.StartsWith('?? ') })
  if ($trackedStatus.Count -gt 0) { throw "Tracked repository status is not clean: $($trackedStatus -join ', ')" }
  $untracked = @($statusLines | Where-Object { $_.StartsWith('?? ') } | ForEach-Object { $_.Substring(3) })
  Assert-ExactUntrackedSet -Actual $untracked -Expected $script:ProtectedUntracked
  $protectedHashes = & $SnapshotProvider $Repo $script:ProtectedUntracked

  [void](Invoke-RepositoryNative -Native $Native -FilePath 'node' `
    -Arguments @('scripts/check-version-consistency.test.js') -Repo $Repo)
  [void](Invoke-RepositoryNative -Native $Native -FilePath 'node' `
    -Arguments @('scripts/check-version-consistency.js') -Repo $Repo)
  $syntaxProbe = @'
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
if(scripts.length!==1) throw new Error(`Expected 1 inline script, got ${scripts.length}`);
new vm.Script(scripts[0][1]);
const version=html.match(/const APP_VERSION = '([^']+)';/)?.[1];
const date=html.match(/const APP_DATE = '(\d{4}-\d{2}-\d{2})';/)?.[1];
if(!version) throw new Error('APP_VERSION was not found in index.html.');
if(!date) throw new Error('APP_DATE was not found in index.html.');
process.stdout.write(JSON.stringify({version,date}));
'@
  $appIdentityJson = (Invoke-RepositoryNative -Native $Native -FilePath 'node' `
    -Arguments @('-e', $syntaxProbe) -Repo $Repo).StdOut
  try {
    $appIdentity = $appIdentityJson | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Node app identity probe returned invalid JSON: $appIdentityJson"
  }

  [void](Invoke-RepositoryNative -Native $Native -FilePath 'pwsh' `
    -Arguments @('-NoProfile', '-File', 'scripts/test-deploy.ps1') -Repo $Repo)

  $indexPath = Join-Path $Repo 'index.html'
  $version = [string]$appIdentity.version
  $date = [string]$appIdentity.date

  [void](Invoke-RepositoryNative -Native $Native -FilePath 'gh' -Arguments @('auth', 'status') -Repo $Repo)
  $pushPermission = (Invoke-RepositoryNative -Native $Native -FilePath 'gh' `
    -Arguments @('api', "repos/$($script:ExpectedRepoSlug)", '--jq', '.permissions.push') -Repo $Repo).StdOut.Trim()
  if ($pushPermission -ne 'true') { throw "GitHub push permission is not available for $($script:ExpectedRepoSlug)." }

  $remoteLine = (Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('ls-remote', 'origin', "refs/heads/$($script:ExpectedBranch)") -Repo $Repo).StdOut.Trim()
  if (-not $remoteLine) { throw "Remote branch origin/$($script:ExpectedBranch) is not reachable." }
  $remoteHead = ($remoteLine -split '\s+')[0].ToLowerInvariant()
  [void](Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('fetch', '--no-tags', 'origin', $script:ExpectedBranch) -Repo $Repo)
  $head = (Invoke-RepositoryNative -Native $Native -FilePath 'git' -Arguments @('rev-parse', 'HEAD') -Repo $Repo).StdOut.Trim().ToLowerInvariant()

  $remoteAncestor = (Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('merge-base', '--is-ancestor', $remoteHead, $head) -Repo $Repo -AllowedExitCodes @(0, 1)).ExitCode -eq 0
  $localAncestor = (Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('merge-base', '--is-ancestor', $head, $remoteHead) -Repo $Repo -AllowedExitCodes @(0, 1)).ExitCode -eq 0
  $relation = Resolve-RemoteRelation -LocalHead $head -RemoteHead $remoteHead -RemoteIsAncestor $remoteAncestor -LocalIsAncestor $localAncestor
  if ($relation -in @('remote-ahead', 'diverged')) {
    throw "Deployment stopped because origin/$($script:ExpectedBranch) is $relation."
  }
  $commits = if ($relation -eq 'local-ahead') {
    @((Invoke-RepositoryNative -Native $Native -FilePath 'git' `
      -Arguments @('log', '--format=%H %s', "$remoteHead..$head") -Repo $Repo).StdOut -split "`r?`n" | Where-Object { $_ })
  } else { @() }
  $changedPaths = if ($relation -eq 'local-ahead') {
    @((Invoke-RepositoryNative -Native $Native -FilePath 'git' `
      -Arguments @('diff', '--name-only', "$remoteHead..$head") -Repo $Repo).StdOut -split "`r?`n" | Where-Object { $_ })
  } else { @() }
  $afterProbeHashes = & $SnapshotProvider $Repo $script:ProtectedUntracked
  Assert-ProtectedSnapshot -Before $protectedHashes -After $afterProbeHashes

  return [pscustomobject]@{
    Branch = $branch
    OriginSlug = $remoteIdentity.Slug
    FetchUrl = $remoteIdentity.FetchUrl
    PushUrl = $remoteIdentity.PushUrl
    Head = $head
    RemoteHead = $remoteHead
    Relation = $relation
    Version = $version
    Date = $date
    Untracked = $untracked
    Commits = $commits
    ChangedPaths = $changedPaths
    ProtectedHashes = $protectedHashes
    IndexPath = $indexPath
  }
}

function Get-RepositoryState {
  [CmdletBinding()]
  param(
    [string]$Repo = $script:RepoRoot,
    [scriptblock]$Native,
    [scriptblock]$SnapshotProvider
  )

  if ($null -eq $SnapshotProvider) {
    $SnapshotProvider = { param($repoPath, $protectedPaths) Get-ProtectedSnapshot -Repo $repoPath -Paths $protectedPaths }
  }

  $branch = (Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('branch', '--show-current') -Repo $Repo).StdOut.Trim()
  $remoteIdentity = Get-RemoteIdentity -Repo $Repo -Native $Native
  $head = (Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('rev-parse', 'HEAD') -Repo $Repo).StdOut.Trim().ToLowerInvariant()
  $localMasterHead = (Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('rev-parse', "refs/heads/$($script:ExpectedBranch)") -Repo $Repo).StdOut.Trim().ToLowerInvariant()
  $originHead = (Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('rev-parse', "refs/remotes/origin/$($script:ExpectedBranch)") -Repo $Repo).StdOut.Trim().ToLowerInvariant()
  $remoteLine = (Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('ls-remote', 'origin', "refs/heads/$($script:ExpectedBranch)") -Repo $Repo).StdOut.Trim()
  if (-not $remoteLine) { throw "Remote branch origin/$($script:ExpectedBranch) is not reachable during final verification." }
  $remoteHead = ($remoteLine -split '\s+')[0].ToLowerInvariant()

  $workingDiff = Invoke-RepositoryNative -Native $Native -FilePath 'git' -Arguments @('diff', '--quiet') `
    -Repo $Repo -AllowedExitCodes @(0, 1)
  $stagedDiff = Invoke-RepositoryNative -Native $Native -FilePath 'git' -Arguments @('diff', '--cached', '--quiet') `
    -Repo $Repo -AllowedExitCodes @(0, 1)
  $statusLines = @((Invoke-RepositoryNative -Native $Native -FilePath 'git' `
    -Arguments @('-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-uall') -Repo $Repo).StdOut `
    -split "`r?`n" | Where-Object { $_ })
  $trackedStatus = @($statusLines | Where-Object { -not $_.StartsWith('?? ') })
  $untracked = @($statusLines | Where-Object { $_.StartsWith('?? ') } | ForEach-Object { $_.Substring(3) })
  $protectedHashes = & $SnapshotProvider $Repo $script:ProtectedUntracked

  return [pscustomobject]@{
    Branch = $branch
    Head = $head
    LocalMasterHead = $localMasterHead
    OriginHead = $originHead
    RemoteHead = $remoteHead
    FetchUrl = $remoteIdentity.FetchUrl
    PushUrl = $remoteIdentity.PushUrl
    TrackedClean = ($workingDiff.ExitCode -eq 0 -and $trackedStatus.Count -eq 0)
    StagedClean = ($stagedDiff.ExitCode -eq 0)
    Untracked = $untracked
    ProtectedHashes = $protectedHashes
  }
}

function Get-PrePushRepositoryState {
  [CmdletBinding()]
  param(
    [string]$Repo = $script:RepoRoot,
    [scriptblock]$Native,
    [scriptblock]$SnapshotProvider
  )

  return Get-RepositoryState -Repo $Repo -Native $Native -SnapshotProvider $SnapshotProvider
}

function Assert-RepositoryWriteBoundaryState {
  param(
    [Parameter(Mandatory)][object]$Initial,
    [Parameter(Mandatory)][object]$State
  )

  if ($State.Branch -ne $script:ExpectedBranch) {
    throw "Pre-push repository branch '$($State.Branch)' is not $($script:ExpectedBranch)."
  }
  foreach ($property in @('Head', 'LocalMasterHead')) {
    if ([string]$State.$property -ne [string]$Initial.Head) {
      throw "Pre-push repository $property '$($State.$property)' does not equal initial HEAD '$($Initial.Head)'."
    }
  }
  foreach ($property in @('FetchUrl', 'PushUrl')) {
    if ([string]$State.$property -ne [string]$Initial.$property) {
      throw "Pre-push repository $property changed from '$($Initial.$property)' to '$($State.$property)'."
    }
  }
  if (-not [bool]$State.TrackedClean) { throw 'Pre-push repository tracked working tree is not clean.' }
  if (-not [bool]$State.StagedClean) { throw 'Pre-push repository staged index is not clean.' }
  Assert-ExactUntrackedSet -Actual @($State.Untracked) -Expected $script:ProtectedUntracked
  Assert-ProtectedSnapshot -Before $Initial.ProtectedHashes -After $State.ProtectedHashes
}

function Assert-PrePushRepositoryState {
  param(
    [Parameter(Mandatory)][object]$Initial,
    [Parameter(Mandatory)][object]$State,
    [switch]$AfterPush
  )

  Assert-RepositoryWriteBoundaryState -Initial $Initial -State $State

  $expectedRemoteHead = if ($AfterPush) { [string]$Initial.Head } else { [string]$Initial.RemoteHead }
  foreach ($property in @('OriginHead', 'RemoteHead')) {
    if ([string]$State.$property -ne $expectedRemoteHead) {
      throw "Pre-push repository $property '$($State.$property)' does not equal expected remote HEAD '$expectedRemoteHead'."
    }
  }
}

function Invoke-ExactHeadPush {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][object]$Initial,
    [string]$Repo = $script:RepoRoot,
    [scriptblock]$Native,
    [scriptblock]$SnapshotProvider
  )

  $before = Get-PrePushRepositoryState -Repo $Repo -Native $Native -SnapshotProvider $SnapshotProvider
  Assert-PrePushRepositoryState -Initial $Initial -State $before
  try {
    [void](Invoke-RepositoryNative -Native $Native -FilePath 'git' `
      -Arguments @('push', 'origin', $script:ExpectedBranch) -Repo $Repo)
  } catch {
    $pushException = $_.Exception
    try {
      $uncertainState = Get-PrePushRepositoryState -Repo $Repo -Native $Native `
        -SnapshotProvider $SnapshotProvider
      Assert-RepositoryWriteBoundaryState -Initial $Initial -State $uncertainState
      $stateEvidence = "branch=$($uncertainState.Branch); HEAD=$($uncertainState.Head); " +
        "localMaster=$($uncertainState.LocalMasterHead); originMaster=$($uncertainState.OriginHead); " +
        "remote=$($uncertainState.RemoteHead); fetchUrl=$($uncertainState.FetchUrl); " +
        "pushUrl=$($uncertainState.PushUrl); protectedHashes=$($uncertainState.ProtectedHashes.Count)"
      if ([string]$uncertainState.RemoteHead -eq [string]$Initial.Head) {
        if ([string]$uncertainState.OriginHead -notin @([string]$Initial.RemoteHead, [string]$Initial.Head)) {
          throw "origin/master '$($uncertainState.OriginHead)' is inconsistent with the verified remote HEAD."
        }
        $evidence = "push outcome uncertain but remote verified; $stateEvidence"
      } elseif ([string]$uncertainState.RemoteHead -eq [string]$Initial.RemoteHead) {
        if ([string]$uncertainState.OriginHead -ne [string]$Initial.RemoteHead) {
          throw "origin/master '$($uncertainState.OriginHead)' changed while the remote was not updated."
        }
        $evidence = "push failed and remote was not updated; $stateEvidence"
      } else {
        throw "Remote HEAD '$($uncertainState.RemoteHead)' is neither the original remote nor the expected HEAD."
      }
    } catch {
      $evidence = "push outcome uncertain; post-push verification failed: $($_.Exception.Message)"
    }
    $pushException.Data['PushOutcomeEvidence'] = $evidence
    throw $pushException
  }
  $after = Get-PrePushRepositoryState -Repo $Repo -Native $Native -SnapshotProvider $SnapshotProvider
  Assert-PrePushRepositoryState -Initial $Initial -State $after -AfterPush
}

function Assert-ExactRepositoryState {
  param(
    [Parameter(Mandatory)][object]$Initial,
    [Parameter(Mandatory)][object]$Final
  )

  if ($Final.Branch -ne $script:ExpectedBranch) {
    throw "Final repository branch '$($Final.Branch)' is not $($script:ExpectedBranch)."
  }
  foreach ($property in @('Head', 'OriginHead', 'RemoteHead')) {
    if ([string]$Final.$property -ne [string]$Initial.Head) {
      throw "Final repository $property '$($Final.$property)' does not equal initial HEAD '$($Initial.Head)'."
    }
  }
  foreach ($property in @('FetchUrl', 'PushUrl')) {
    if ([string]$Final.$property -ne [string]$Initial.$property) {
      throw "Final repository $property changed from '$($Initial.$property)' to '$($Final.$property)'."
    }
  }
  if (-not [bool]$Final.TrackedClean) { throw 'Final repository tracked working tree is not clean.' }
  if (-not [bool]$Final.StagedClean) { throw 'Final repository staged index is not clean.' }
  Assert-ExactUntrackedSet -Actual @($Final.Untracked) -Expected $script:ProtectedUntracked
  Assert-ProtectedSnapshot -Before $Initial.ProtectedHashes -After $Final.ProtectedHashes
}

function Select-ExactHeadRun {
  param([object[]]$Runs, [Parameter(Mandatory)][string]$Head)

  $matches = @($Runs | Where-Object {
    $_.headSha -eq $Head -and $_.event -eq 'push'
  } | Sort-Object { [DateTimeOffset]$_.createdAt } -Descending | Select-Object -First 1)
  if ($matches.Count -eq 0) { return $null }
  return $matches[0]
}

function Get-PagesWorkflowRuns {
  param(
    [int]$TimeoutSeconds = 60,
    [scriptblock]$Native
  )

  $arguments = @(
    'run', 'list',
    '--workflow', 'pages.yml',
    '--branch', 'master',
    '--limit', '100',
    '--json', 'databaseId,headSha,status,conclusion,url,createdAt,updatedAt,event',
    '--repo', $script:ExpectedRepoSlug
  )
  $result = if ($null -eq $Native) {
    Invoke-CheckedNative -FilePath 'gh' -Arguments $arguments -TimeoutSeconds $TimeoutSeconds
  } else {
    & $Native 'gh' $arguments $TimeoutSeconds
  }
  if (-not $result.StdOut.Trim()) { return @() }
  return @($result.StdOut | ConvertFrom-Json)
}

function Watch-PagesWorkflowRun {
  param(
    [Parameter(Mandatory)][long]$RunId,
    [int]$TimeoutSeconds = 600,
    [scriptblock]$Native
  )

  $arguments = @('run', 'watch', [string]$RunId, '--exit-status', '--repo', $script:ExpectedRepoSlug)
  if ($null -eq $Native) {
    [void](Invoke-CheckedNative -FilePath 'gh' -Arguments $arguments -TimeoutSeconds $TimeoutSeconds)
  } else {
    [void](& $Native 'gh' $arguments $TimeoutSeconds)
  }
}

function Get-PagesWorkflowRun {
  param(
    [Parameter(Mandatory)][long]$RunId,
    [int]$TimeoutSeconds = 60,
    [scriptblock]$Native
  )

  $arguments = @(
    'run', 'view', [string]$RunId,
    '--repo', $script:ExpectedRepoSlug,
    '--json', 'databaseId,headSha,status,conclusion,url,event,jobs'
  )
  $result = if ($null -eq $Native) {
    Invoke-CheckedNative -FilePath 'gh' -Arguments $arguments -TimeoutSeconds $TimeoutSeconds
  } else {
    & $Native 'gh' $arguments $TimeoutSeconds
  }
  if (-not $result.StdOut.Trim()) { throw "Pages run $RunId returned no JSON." }
  return $result.StdOut | ConvertFrom-Json
}

function Assert-SuccessfulPagesRun {
  param(
    [Parameter(Mandatory)][object]$Run,
    [Parameter(Mandatory)][string]$Head,
    [Parameter(Mandatory)][long]$RunId
  )

  if ($Run.headSha -ne $Head) { throw "Pages run HEAD '$($Run.headSha)' does not equal local HEAD '$Head'." }
  if ([long]$Run.databaseId -ne $RunId) {
    throw "Pages run database id '$($Run.databaseId)' does not equal selected run id '$RunId'."
  }
  $canonicalPrefix = "https://github.com/$($script:ExpectedRepoSlug)/actions/runs/"
  if (-not ([string]$Run.url).StartsWith($canonicalPrefix, [StringComparison]::Ordinal)) {
    throw "Pages run URL '$($Run.url)' is outside canonical repository $($script:ExpectedRepoSlug)."
  }
  $urlSuffix = ([string]$Run.url).Substring($canonicalPrefix.Length)
  $urlIdText = ($urlSuffix -split '/', 2)[0]
  $urlId = 0L
  if (-not [long]::TryParse($urlIdText, [ref]$urlId) -or $urlId -ne $RunId) {
    throw "Pages run URL id '$urlIdText' does not equal selected run id '$RunId'."
  }
  if ($Run.event -ne 'push') { throw "Pages run event '$($Run.event)' is not push." }
  if ($Run.status -ne 'completed' -or $Run.conclusion -ne 'success') {
    throw "Pages run for HEAD $Head is $($Run.status)/$($Run.conclusion)."
  }
  foreach ($jobName in @('build', 'deploy')) {
    $job = @($Run.jobs | Where-Object name -eq $jobName | Select-Object -First 1)[0]
    if ($null -eq $job -or $job.status -ne 'completed' -or $job.conclusion -ne 'success') {
      $state = if ($null -eq $job) { 'missing' } else { "$($job.status)/$($job.conclusion)" }
      throw "Pages $jobName job for HEAD $Head is $state."
    }
  }
}

function Get-RemainingWholeSeconds {
  param(
    [Parameter(Mandatory)][DateTimeOffset]$Deadline,
    [Parameter(Mandatory)][string]$Operation
  )

  $remaining = [int][Math]::Floor(($Deadline - [DateTimeOffset]::UtcNow).TotalSeconds)
  if ($remaining -le 0) { throw "Timed out before $Operation." }
  return $remaining
}

function Wait-ExactHeadRun {
  param(
    [Parameter(Mandatory)][string]$Head,
    [Parameter(Mandatory)][Collections.IDictionary]$Adapters,
    [int]$TimeoutSeconds = 600
  )

  $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
  $lastState = 'no matching push run observed'
  while ($true) {
    $remainingSeconds = Get-RemainingWholeSeconds -Deadline $deadline -Operation "Pages run list for HEAD $Head"
    $runs = @(& $Adapters['RunList'] $remainingSeconds)
    [void](Get-RemainingWholeSeconds -Deadline $deadline -Operation "Pages run list for HEAD $Head")
    $run = Select-ExactHeadRun -Runs $runs -Head $Head
    if ($null -ne $run) {
      $lastState = "id=$($run.databaseId) $($run.status)/$($run.conclusion)"
      try {
        $remainingSeconds = Get-RemainingWholeSeconds -Deadline $deadline -Operation "Pages run watch for HEAD $Head"
        & $Adapters['WatchRun'] $run.databaseId $remainingSeconds
        [void](Get-RemainingWholeSeconds -Deadline $deadline -Operation "Pages run watch for HEAD $Head")
      } catch {
        throw "Pages run watch failed or timed out for HEAD $Head; last state: $lastState. $($_.Exception.Message)"
      }
      $remainingSeconds = Get-RemainingWholeSeconds -Deadline $deadline -Operation "Pages run view for HEAD $Head"
      $completeRun = & $Adapters['RunView'] $run.databaseId $remainingSeconds
      [void](Get-RemainingWholeSeconds -Deadline $deadline -Operation "Pages run view for HEAD $Head")
      Assert-SuccessfulPagesRun -Run $completeRun -Head $Head -RunId ([long]$run.databaseId)
      return $completeRun
    }
    $remainingSeconds = Get-RemainingWholeSeconds -Deadline $deadline -Operation "Pages run retry sleep for HEAD $Head"
    & $Adapters['Sleep'] ([Math]::Min(2, $remainingSeconds))
    [void](Get-RemainingWholeSeconds -Deadline $deadline -Operation "Pages run retry sleep for HEAD $Head")
  }
}

function Get-LiveSourceBytes {
  param([Parameter(Mandatory)][string]$Url, [int]$TimeoutSeconds = 15)

  if ($TimeoutSeconds -le 0) { throw 'Live source fetch requires a positive timeout.' }
  $client = [Net.Http.HttpClient]::new()
  $client.Timeout = [TimeSpan]::FromSeconds([Math]::Min(15, $TimeoutSeconds))
  try {
    return $client.GetByteArrayAsync($Url).GetAwaiter().GetResult()
  } finally {
    $client.Dispose()
  }
}

function Wait-LiveSourceMatch {
  param(
    [Parameter(Mandatory)][string]$LiveUrl,
    [Parameter(Mandatory)][byte[]]$LocalBytes,
    [Parameter(Mandatory)][Collections.IDictionary]$Adapters,
    [int]$TimeoutSeconds = 300
  )

  $localHash = [Security.Cryptography.SHA256]::HashData($LocalBytes)
  $localHashText = [Convert]::ToHexString($localHash)
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
  $lastProblem = 'live source was not fetched'
  while ($true) {
    try {
      $remainingSeconds = Get-RemainingWholeSeconds -Deadline $deadline -Operation "live source fetch at $LiveUrl"
      $liveBytes = [byte[]](& $Adapters['LiveSource'] $LiveUrl $remainingSeconds)
      [void](Get-RemainingWholeSeconds -Deadline $deadline -Operation "live source fetch at $LiveUrl")
      $liveHashText = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($liveBytes))
      if ($liveHashText -eq $localHashText) {
        return [pscustomobject]@{ Match = $true; Hash = $localHashText; Url = $LiveUrl }
      }
      $lastProblem = "live SHA-256 $liveHashText did not equal local SHA-256 $localHashText"
    } catch {
      $lastProblem = $_.Exception.Message
    }
    try {
      $remainingSeconds = Get-RemainingWholeSeconds -Deadline $deadline -Operation "live source retry sleep at $LiveUrl"
    } catch {
      throw "Live source SHA-256 did not match within $TimeoutSeconds seconds at $LiveUrl; $lastProblem. $($_.Exception.Message)"
    }
    & $Adapters['Sleep'] ([Math]::Min(2, $remainingSeconds))
    try {
      [void](Get-RemainingWholeSeconds -Deadline $deadline -Operation "live source retry sleep at $LiveUrl")
    } catch {
      throw "Live source SHA-256 did not match within $TimeoutSeconds seconds at $LiveUrl; $lastProblem. $($_.Exception.Message)"
    }
  }
}

function New-DeploymentAdapters {
  param([Collections.IDictionary]$Overrides)

  $defaults = @{
    GetRepositoryContext = { Get-RepositoryContext -Repo $script:RepoRoot }
    GetRepositoryState = { Get-RepositoryState -Repo $script:RepoRoot }
    StartLocalSite = { Start-LocalSiteServer -Repo $script:RepoRoot }
    StopLocalSite = { param($site) Stop-OwnedProcess -Process $site.Process -Label 'local HTTP server' }
    Browser = { param($url, $version, $date) Invoke-ChromeSelfTest -Url $url -ExpectedVersion $version -ExpectedDate $date }
    Push = {
      param($context)
      Invoke-ExactHeadPush -Initial $context -Repo $script:RepoRoot
    }
    RunList = {
      param($timeoutSeconds)
      return @(Get-PagesWorkflowRuns -TimeoutSeconds ([Math]::Min(60, $timeoutSeconds)))
    }
    WatchRun = {
      param($id, $timeoutSeconds)
      Watch-PagesWorkflowRun -RunId $id -TimeoutSeconds ([Math]::Min(600, $timeoutSeconds))
    }
    RunView = {
      param($id, $timeoutSeconds)
      return Get-PagesWorkflowRun -RunId $id -TimeoutSeconds ([Math]::Min(60, $timeoutSeconds))
    }
    LocalSource = { [IO.File]::ReadAllBytes((Join-Path $script:RepoRoot 'index.html')) }
    LiveSource = { param($url, $timeoutSeconds) Get-LiveSourceBytes -Url $url -TimeoutSeconds $timeoutSeconds }
    ProtectedSnapshot = { Get-ProtectedSnapshot -Repo $script:RepoRoot -Paths $script:ProtectedUntracked }
    Sleep = { param($seconds) Start-Sleep -Seconds $seconds }
  }
  if ($null -ne $Overrides) {
    foreach ($key in $Overrides.Keys) { $defaults[$key] = $Overrides[$key] }
  }
  return $defaults
}

function Invoke-Mk2mdDeployment {
  [CmdletBinding()]
  param(
    [switch]$IsDryRun,
    [string]$ConfirmedHead,
    [Collections.IDictionary]$Adapters
  )

  $activeAdapters = New-DeploymentAdapters -Overrides $Adapters
  $context = & $activeAdapters['GetRepositoryContext']
  if ($context.Branch -ne $script:ExpectedBranch -or $context.OriginSlug -ne $script:ExpectedRepoSlug) {
    throw 'Repository context does not match the fixed MK2MD origin/master deployment target.'
  }
  if ($context.Relation -in @('remote-ahead', 'diverged')) {
    throw "Deployment stopped because origin/master is $($context.Relation)."
  }

  Assert-ExpectedHead -Actual $context.Head -Expected $ConfirmedHead -DryRun ([bool]$IsDryRun)
  Write-Host "MK2MD v$($context.Version) ($($context.Date))"
  Write-Host "HEAD: $($context.Head)"
  Write-Host "origin/master: $($context.RemoteHead) [$($context.Relation)]"
  foreach ($commit in @($context.Commits)) { Write-Host "commit: $commit" }
  foreach ($path in @($context.ChangedPaths)) { Write-Host "path: $path" }

  $site = $null
  try {
    $site = & $activeAdapters['StartLocalSite']
    $separator = if ($site.Url.Contains('?')) { '&' } else { '?' }
    $localUrl = "$($site.Url)${separator}ci-selftest=1&t=$($context.Head)"
    $localBrowser = & $activeAdapters['Browser'] $localUrl $context.Version $context.Date
    Assert-BrowserResult -Result $localBrowser -Version $context.Version -Date $context.Date
  } finally {
    if ($null -ne $site) { & $activeAdapters['StopLocalSite'] $site }
  }

  $afterLocalSnapshot = & $activeAdapters['ProtectedSnapshot']
  Assert-ProtectedSnapshot -Before $context.ProtectedHashes -After $afterLocalSnapshot
  Write-Host ($localBrowser | ConvertTo-Json -Compress -Depth 6)

  if ($IsDryRun) {
    return [pscustomobject]@{
      DryRun = $true
      Version = $context.Version
      Date = $context.Date
      Head = $context.Head
      Relation = $context.Relation
      LocalBrowser = $localBrowser
      ProtectedHashes = $afterLocalSnapshot
    }
  }

  $pushed = $false
  if ($context.Relation -eq 'local-ahead') {
    & $activeAdapters['Push'] $context
    $pushed = $true
  }
  $run = Wait-ExactHeadRun -Head $context.Head -Adapters $activeAdapters -TimeoutSeconds 600
  $liveUrl = "https://green-tea-king.github.io/md-mind-map/?ci-selftest=1&t=$($context.Head)"
  $localBytes = [byte[]](& $activeAdapters['LocalSource'])
  [void](Wait-LiveSourceMatch -LiveUrl $liveUrl -LocalBytes $localBytes -Adapters $activeAdapters -TimeoutSeconds 300)
  $liveBrowser = & $activeAdapters['Browser'] $liveUrl $context.Version $context.Date
  Assert-BrowserResult -Result $liveBrowser -Version $context.Version -Date $context.Date
  $finalState = & $activeAdapters['GetRepositoryState']
  Assert-ExactRepositoryState -Initial $context -Final $finalState
  $afterSnapshot = $finalState.ProtectedHashes

  return [pscustomobject]@{
    Version = $context.Version
    Date = $context.Date
    Head = $context.Head
    Relation = $context.Relation
    Pushed = $pushed
    ActionsId = $run.databaseId
    ActionsUrl = $run.url
    LiveUrl = $liveUrl
    LocalBrowser = $localBrowser
    LiveBrowser = $liveBrowser
    ProtectedHashes = $afterSnapshot
    CompletedAt = [DateTimeOffset]::Now
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  Invoke-Mk2mdDeployment -IsDryRun:$DryRun -ConfirmedHead $ExpectedHead
}
