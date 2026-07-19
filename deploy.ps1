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
$script:CdpSettleMilliseconds = 1000
$script:ProtectedUntracked = @(
  'BACKUP_MANIFEST.md',
  'MD心智圖_v10_00.html',
  'agent.md',
  'clear-auto-draft.html',
  'design.md',
  'repository-history.bundle'
)

function Invoke-CheckedNative {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = $script:RepoRoot,
    [int]$TimeoutSeconds = 0
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
  if ($TimeoutSeconds -gt 0 -and -not $process.WaitForExit($TimeoutSeconds * 1000)) {
    $process.Kill($true)
    $process.WaitForExit()
    throw "Native command timed out after $TimeoutSeconds seconds: $FilePath $($Arguments -join ' ')"
  }
  if ($TimeoutSeconds -le 0) { $process.WaitForExit() }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $result = [pscustomobject]@{ ExitCode = $process.ExitCode; StdOut = $stdout; StdErr = $stderr }
  if ($result.ExitCode -ne 0) {
    throw "Native command failed ($($result.ExitCode)): $FilePath $($Arguments -join ' ')`n$stderr"
  }
  return $result
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

function Stop-OwnedProcess {
  param(
    [Parameter(Mandatory)][Diagnostics.Process]$Process,
    [Parameter(Mandatory)][string]$Label
  )

  $portProperty = $Process.PSObject.Properties['Mk2mdOwnedPort']
  $ownedPort = if ($null -ne $portProperty) { [int]$portProperty.Value } else { 0 }
  $Process.Refresh()
  if (-not $Process.HasExited) {
    $Process.Kill($true)
    if (-not $Process.WaitForExit(10000)) {
      throw "Timed out stopping $Label process $($Process.Id)."
    }
  } else {
    $Process.WaitForExit()
  }

  foreach ($taskName in @('Mk2mdStdOutTask', 'Mk2mdStdErrTask')) {
    $taskProperty = $Process.PSObject.Properties[$taskName]
    if ($null -ne $taskProperty) { [void]$taskProperty.Value.GetAwaiter().GetResult() }
  }

  if ($ownedPort -gt 0) {
    $released = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
      $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
      if (-not ($listeners | Where-Object Port -eq $ownedPort)) {
        $released = $true
        break
      }
      Start-Sleep -Milliseconds 100
    }
    if (-not $released) { throw "$Label stopped, but port $ownedPort still has a listener." }
  }
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
    [int]$TimeoutSeconds = 10
  )

  $buffer = [byte[]]::new(65536)
  $stream = [IO.MemoryStream]::new()
  $cancellation = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($TimeoutSeconds))
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
    throw "Timed out waiting $TimeoutSeconds seconds for a CDP message."
  } finally {
    $cancellation.Dispose()
    $stream.Dispose()
  }
}

function Invoke-CdpCommand {
  param(
    [Parameter(Mandatory)][Net.WebSockets.ClientWebSocket]$WebSocket,
    [Parameter(Mandatory)][string]$Method,
    [object]$Params = $null,
    [Collections.IList]$EventSink = $null,
    [int]$TimeoutSeconds = 10
  )

  if ($null -eq (Get-Variable CdpNextId -Scope Script -ErrorAction SilentlyContinue)) {
    $script:CdpNextId = 0
  }
  $script:CdpNextId++
  $id = $script:CdpNextId
  $message = [ordered]@{ id = $id; method = $Method }
  if ($null -ne $Params) { $message.params = $Params }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($message | ConvertTo-Json -Compress -Depth 30))
  $cancellation = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($TimeoutSeconds))
  try {
    $segment = [ArraySegment[byte]]::new($bytes)
    [void]$WebSocket.SendAsync(
      $segment,
      [Net.WebSockets.WebSocketMessageType]::Text,
      $true,
      $cancellation.Token
    ).GetAwaiter().GetResult()
  } catch [OperationCanceledException] {
    throw "Timed out sending CDP command: $Method"
  } finally {
    $cancellation.Dispose()
  }

  while ($true) {
    $incoming = Receive-CdpMessage -WebSocket $WebSocket -TimeoutSeconds $TimeoutSeconds
    if ($incoming.PSObject.Properties.Name -contains 'method') {
      if ($null -ne $EventSink) { [void]$EventSink.Add($incoming) }
      continue
    }
    if (($incoming.PSObject.Properties.Name -contains 'id') -and [int64]$incoming.id -eq $id) {
      if ($incoming.PSObject.Properties.Name -contains 'error') {
        throw "CDP command failed ($Method): $($incoming.error | ConvertTo-Json -Compress -Depth 10)"
      }
      return $incoming
    }
  }
}

function Invoke-ChromeSelfTest {
  param(
    [Parameter(Mandatory)][uri]$Url,
    [Parameter(Mandatory)][string]$ExpectedVersion,
    [Parameter(Mandatory)][string]$ExpectedDate
  )

  $chromeCandidates = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  )
  $chromePath = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $chromePath) { throw 'Installed Google Chrome was not found.' }

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
    '--disable-background-timer-throttling',
    'about:blank'
  )) { [void]$psi.ArgumentList.Add($argument) }

  $chrome = [Diagnostics.Process]::new()
  $chrome.StartInfo = $psi
  [void]$chrome.Start()
  $chrome | Add-Member -NotePropertyName Mk2mdOwnedPort -NotePropertyValue $debugPort
  $chrome | Add-Member -NotePropertyName Mk2mdStdOutTask -NotePropertyValue $chrome.StandardOutput.ReadToEndAsync()
  $chrome | Add-Member -NotePropertyName Mk2mdStdErrTask -NotePropertyValue $chrome.StandardError.ReadToEndAsync()

  $handler = [Net.Http.HttpClientHandler]::new()
  $handler.UseProxy = $false
  $client = [Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(2)
  $socket = [Net.WebSockets.ClientWebSocket]::new()
  try {
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
        } -EventSink $events
      } catch {
        if ($_.Exception.Message -notmatch 'Inspected target navigated or closed') { throw }
        Start-Sleep -Milliseconds 250
        continue
      }
      $value = $evaluation.result.result.value
      if ($value) {
        $dom = $value | ConvertFrom-Json
        if ($dom.selfTest -in @('pass', 'fail')) { break }
      }
      Start-Sleep -Milliseconds 250
    }
    if ($null -eq $dom -or $dom.selfTest -notin @('pass', 'fail')) {
      throw "Chrome self-test did not finish within 90 seconds for MK2MD v$ExpectedVersion ($ExpectedDate)."
    }

    $settleDeadline = [DateTime]::UtcNow.AddMilliseconds($script:CdpSettleMilliseconds)
    do {
      Start-Sleep -Milliseconds 100
      $evaluation = Invoke-CdpCommand -WebSocket $socket -Method 'Runtime.evaluate' -Params @{
        expression = $expression
        returnByValue = $true
      } -EventSink $events -TimeoutSeconds 2
      $value = $evaluation.result.result.value
      if (-not $value) { throw 'Chrome returned no DOM state during the CDP settle window.' }
      $dom = $value | ConvertFrom-Json
    } while ([DateTime]::UtcNow -lt $settleDeadline)

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

    return [pscustomobject]@{
      Title = [string]$dom.title
      Brand = [string]$dom.brand
      VersionText = [string]$dom.versionText
      Passed = [int]$dom.passed
      Failed = [int]$dom.failed
      ConsoleErrors = @($consoleErrors)
      PageErrors = @($pageErrors)
      Warnings = @($warnings)
    }
  } finally {
    $closeFailure = ''
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
        $closeFailure = "Chrome CDP WebSocket close timed out after $($script:CdpCloseTimeoutSeconds) seconds."
        $socket.Abort()
      } catch {
        $closeFailure = "Chrome CDP WebSocket close failed: $($_.Exception.Message)"
        $socket.Abort()
      } finally {
        $closeCancellation.Dispose()
      }
    }
    $socket.Dispose()
    $client.Dispose()
    $handler.Dispose()
    Stop-OwnedProcess -Process $chrome -Label 'headless Chrome'
    if ($closeFailure) { throw $closeFailure }
  }
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
  if ([int]$Result.Passed -ne 11 -or [int]$Result.Failed -ne 0) {
    $problems.Add("self-test $($Result.Passed)/11 with $($Result.Failed) failed")
  }
  if (@($Result.ConsoleErrors).Count -ne 0) { $problems.Add("$(@($Result.ConsoleErrors).Count) console errors") }
  if (@($Result.PageErrors).Count -ne 0) { $problems.Add("$(@($Result.PageErrors).Count) page errors") }
  if (@($Result.Warnings).Count -gt 6) { $problems.Add("$(@($Result.Warnings).Count) warnings") }
  if ($problems.Count -gt 0) { throw "Browser preflight failed: $($problems -join '; ')." }
}

function Invoke-Mk2mdDeployment {
  param([switch]$IsDryRun, [string]$ConfirmedHead)
  if (-not $IsDryRun) {
    throw 'Actual deployment is disabled by the policy-core build.'
  }
  return [pscustomobject]@{
    Phase = 'policy-core'
    DryRun = $true
    ConfirmedHead = $ConfirmedHead
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  Invoke-Mk2mdDeployment -IsDryRun:$DryRun -ConfirmedHead $ExpectedHead
}
