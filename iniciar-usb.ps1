param([string]$Puerto = 'COM3')

$ErrorActionPreference = 'Stop'
$firmwareConfig = Join-Path $PSScriptRoot 'esp32_firmware/NeuroRobi_Oso/telemetry.local.h'
$backendConfig = Join-Path $PSScriptRoot 'backend_NeuroRobi-main/neurorobi_backend/.env'
$key = ''
if (Test-Path -LiteralPath $firmwareConfig) {
    $key = [regex]::Match((Get-Content -Raw -LiteralPath $firmwareConfig), '(?m)^#define\s+NEUROROBI_DEVICE_KEY\s+"([^"]+)"').Groups[1].Value
}
if (!$key -and (Test-Path -LiteralPath $backendConfig)) {
    $key = [regex]::Match((Get-Content -Raw -LiteralPath $backendConfig), '(?m)^\s*TELEMETRY_API_KEY\s*=\s*([^\r\n]+)').Groups[1].Value.Trim().Trim('"', "'")
}
if (!$key) { throw 'Falta la clave del dispositivo. Revisa telemetry.local.h o el .env del backend.' }

$api = 'http://127.0.0.1:3001'
Invoke-RestMethod -Uri "$api/health" -TimeoutSec 3 | Out-Null
$serial = [IO.Ports.SerialPort]::new($Puerto, 115200)
$serial.ReadTimeout = 500
$serial.WriteTimeout = 500
$headers = @{ 'x-device-key' = $key; 'x-device-id' = 'oso-principal' }

try {
    $serial.Open()
    Write-Host "Leyendo $Puerto. Pulsa Ctrl+C para cerrar."
    $active = $false
    $online = $false
    while ($true) {
        try {
            $serial.DiscardInBuffer()
            if ($active) { $serial.Write('M') } else { $serial.Write('H') }
            $line = $serial.ReadLine().Trim()
            while (!$line.StartsWith('{')) { $line = $serial.ReadLine().Trim() }
            $reply = Invoke-RestMethod -Uri "$api/api/telemetry" -Method Post -Headers $headers -ContentType 'application/json' -Body $line -TimeoutSec 2
            if (!$online) { Write-Host 'Oso conectado a NeuroRobi por USB.' }
            $online = $true
            $active = $reply.therapyActive -eq $true
        } catch {
            Write-Warning $_.Exception.Message
            $online = $false
            $active = $false
        }
        if ($active) { Start-Sleep -Milliseconds 90 } else { Start-Sleep -Milliseconds 1000 }
    }
} finally {
    $serial.Dispose()
}
