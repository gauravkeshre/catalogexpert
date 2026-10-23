param(
    [switch]$Clean = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    Write-Host "Building App Definitions Explorer..." -ForegroundColor Cyan
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "The Vite build failed. Run npm ci before the first build."
    }
    Write-Host "Production files are in docs." -ForegroundColor Green
}
finally {
    Pop-Location
}
