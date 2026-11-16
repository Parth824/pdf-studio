$projectRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $projectRoot '.runtime/tunnel.json'
if (Test-Path -LiteralPath $statePath) {
    $tunnelState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $expectedExecutable = [IO.Path]::GetFullPath((Join-Path $projectRoot '.runtime/tools/cloudflared.exe'))
    $tunnelProcess = Get-Process -Id $tunnelState.pid -ErrorAction SilentlyContinue
    if ($tunnelProcess) {
        if ($tunnelProcess.Path -ne $expectedExecutable) {
            throw 'The saved process belongs to another program; it was not stopped.'
        }
        Stop-Process -Id $tunnelProcess.Id -ErrorAction Stop
    }
    Remove-Item -LiteralPath $statePath
}
Write-Output 'Public sharing stopped. The local website is still available.'
