param (
    [string]$IpAddress = ""
)

$KeyFile = Get-ChildItem -Filter *.pem | Select-Object -First 1
if (-not $KeyFile) {
    Write-Error "Error: .pem file not found in this folder."
    exit 1
}

if ($IpAddress -eq "") {
    $IpAddress = Read-Host "Enter server IP address (IPv4 or IPv6)"
}

# IPv6 address handling: wrap in brackets if needed
if ($IpAddress -match ":" -and $IpAddress -notmatch "^\[") {
    $IpAddress = "[$IpAddress]"
    Write-Host "IPv6 detected, using: $IpAddress" -ForegroundColor Gray
}

Write-Host "Connecting to $IpAddress using $($KeyFile.Name)..." -ForegroundColor Cyan

$TempDir = ".\.deploy_temp"
$SourceDir = Get-Location

if (Test-Path $TempDir) {
    Remove-Item -Path $TempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

$IncludeItems = @(
    "src",
    "server",
    "docs",
    "Dockerfile",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.node.json",
    "tsconfig.server.json",
    "vite.config.ts",
    "start-stream.sh",
    "test-screenshot.sh",
    "index.html",
    ".env.example"
)

Write-Host "Preparing files for upload..."
foreach ($item in $IncludeItems) {
    $itemPath = Join-Path $SourceDir $item
    if (Test-Path $itemPath) {
        Copy-Item -Path $itemPath -Destination $TempDir -Recurse -Force
    }
}

Write-Host "Uploading files (skipping node_modules)..." -ForegroundColor Yellow

ssh -i $KeyFile.FullName -o StrictHostKeyChecking=no "ec2-user@$IpAddress" "mkdir -p ~/kalukalu"

$scpSource = Join-Path $TempDir "*"
scp -i $KeyFile.FullName -o StrictHostKeyChecking=no -r $scpSource "ec2-user@${IpAddress}:~/kalukalu/"

Remove-Item -Path $TempDir -Recurse -Force

if ($LASTEXITCODE -eq 0) {
    Write-Host "Upload Complete!" -ForegroundColor Green
    Write-Host "Next steps:"
    Write-Host "  1. ssh -i $($KeyFile.Name) ec2-user@$IpAddress"
    Write-Host "  2. cd kalukalu"
    Write-Host "  3. docker build -t kalukalu-stream ."
} else {
    Write-Host "Upload Failed." -ForegroundColor Red
}
