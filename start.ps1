param([switch]$SetAdminPassword)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$venvPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    $pythonCommand = $env:TOURNEY_PYTHON
    $pythonArguments = @()
    if (-not $pythonCommand) {
        if (Get-Command py -ErrorAction SilentlyContinue) {
            $pythonCommand = 'py'
            $pythonArguments = @('-3')
        } elseif (Get-Command python -ErrorAction SilentlyContinue) {
            $pythonCommand = 'python'
        } else {
            throw 'Install Python 3.11 or newer, or set TOURNEY_PYTHON to python.exe.'
        }
    }
    & $pythonCommand @pythonArguments -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment.' }
}
& $venvPython -c "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('flask') else 1)"
if ($LASTEXITCODE -ne 0) {
    & $venvPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
& $venvPython -m flask --app app seed-demo
if ($LASTEXITCODE -ne 0) { throw 'Database setup failed.' }
if ($SetAdminPassword) {
    & $venvPython -m flask --app app set-admin
    if ($LASTEXITCODE -ne 0) { throw 'Password setup failed.' }
}
Write-Host 'Opening the local box office. Press Ctrl+C to stop.' -ForegroundColor Yellow
& $venvPython app.py

