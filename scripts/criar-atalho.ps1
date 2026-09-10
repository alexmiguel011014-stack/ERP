param([switch]$Dev = $false)

$Desktop = [Environment]::GetFolderPath("Desktop")
$Root = Split-Path -Parent $PSScriptRoot
$Name = "ALLU ERP"
$Shortcut = Join-Path $Desktop "$Name.lnk"
$Icon = Join-Path $Root "build\icon.ico"

if ($Dev) {
    $Target = "wscript.exe"
    $Arguments = "`"$Root\ERP_Launcher.vbs`""
    Write-Host "Criando atalho DEV (sem janela de console)..."
} else {
    $Exe = @(Get-ChildItem -Path (Join-Path $Root "dist") -Filter "*.exe" -ErrorAction SilentlyContinue)
    if ($Exe) {
        $Target = $Exe[0].FullName
        $Arguments = ""
        Write-Host "Encontrado: $Target"
    } else {
        Write-Host "Erro: Executavel nao encontrado em dist/"
        exit 1
    }
}

$Shell = New-Object -ComObject WScript.Shell
$Link = $Shell.CreateShortcut($Shortcut)
$Link.TargetPath = $Target
if ($Arguments) { $Link.Arguments = $Arguments }
$Link.WorkingDirectory = $Root
$Link.Description = "ERP - Sistema de gestao comercial"
$Link.WindowStyle = 1

if (Test-Path $Icon) {
    $Link.IconLocation = $Icon
    Write-Host "Icone: OK"
}

$Link.Save()
Write-Host "Atalho criado: $Shortcut"
