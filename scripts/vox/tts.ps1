# vox 組：用本機 Windows 中文語音（OneCore：Yating / Zhiwei / Hanhan，WinRT Windows.Media.SpeechSynthesis）離線念出台詞表。
# 台詞文字只在本機處理，不會送到任何線上服務。輸出是原料（之後由 scripts/vox/build.py 大幅處理成角色）。
# 用法：powershell -ExecutionPolicy Bypass -File scripts/vox/tts.ps1 -Jobs <jobs.json> -Out <資料夾>
#   jobs.json：[{ "id": "f_self_linxiaoyu", "voice": "zhiwei", "text": "林小雨。", "rate": 1.0, "pitch": 0 }, ...]
param([string]$Jobs, [string]$Out, [switch]$Force)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTaskOp = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await-Op($op, [Type]$t) { $task = $asTaskOp.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; return $task.Result }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
$voices = @{}
foreach ($v in $all) {
  if ($v.DisplayName -match 'Yating') { $voices['yating'] = $v }
  if ($v.DisplayName -match 'Zhiwei') { $voices['zhiwei'] = $v }
  if ($v.DisplayName -match 'Hanhan') { $voices['hanhan'] = $v }
}
New-Item -ItemType Directory -Force $Out | Out-Null
$list = Get-Content -Raw -Encoding UTF8 $Jobs | ConvertFrom-Json
$n = 0
foreach ($j in $list) {
  $path = Join-Path $Out ($j.id + '.wav')
  if ((Test-Path $path) -and -not $Force) { continue }
  $synth.Voice = $voices[$j.voice]
  $rate = if ($j.rate) { [double]$j.rate } else { 1.0 }
  $pitch = if ($j.pitch) { [int]$j.pitch } else { 0 }
  $lang = 'zh-TW'
  $txt = [System.Security.SecurityElement]::Escape($j.text)
  $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='$lang'><prosody rate='$rate' pitch='$($pitch)%'>$txt</prosody></speak>"
  $stream = Await-Op ($synth.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32]$stream.Size
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Await-Op ($reader.LoadAsync($size)) ([uint32])
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes($path, $bytes)
  $reader.Dispose(); $stream.Dispose()
  $n++
}
Write-Output "tts: $n new files -> $Out"
