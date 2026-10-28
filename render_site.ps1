# Render the auditor, then the in-browser report.
# The auditor render clears docs/, so the report has to be rendered second.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

$vfsReport = Join-Path $root "describe\vfs\report\R"
$vfsData = Join-Path $root "describe\vfs\data"
$vendor = Join-Path $root "describe\vendor"
if (Test-Path (Join-Path $root "describe\vfs")) {
  Remove-Item -Recurse -Force (Join-Path $root "describe\vfs")
}
New-Item -ItemType Directory -Force -Path $vfsReport | Out-Null
New-Item -ItemType Directory -Force -Path $vfsData | Out-Null
New-Item -ItemType Directory -Force -Path $vendor | Out-Null
Copy-Item (Join-Path $root "report\R\*.R") $vfsReport
Copy-Item (Join-Path $root "data\master_dictionary.json") $vfsData
Copy-Item (Join-Path $root "src\xlsx.full.min.js") $vendor

quarto render
Set-Location (Join-Path $root "describe")
quarto render
Set-Location $root
