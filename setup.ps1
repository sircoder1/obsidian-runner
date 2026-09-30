$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22 or newer is required. Install it from https://nodejs.org/"
}

node "$PSScriptRoot\scripts\setup-lab.js" --start
exit $LASTEXITCODE
