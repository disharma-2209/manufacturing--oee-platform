$baseUrl = "https://manufacturing-oee-platform-euyd0pkt8-oee-platform-s-projects.vercel.app"

# Check diag first
$diag = Invoke-WebRequest -Uri "$baseUrl/api/diag" -UseBasicParsing -TimeoutSec 20
Write-Output "=== DIAG ==="
$diag.Content | ConvertFrom-Json | ConvertTo-Json

# Check health
Write-Output "`n=== HEALTH ==="
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing -TimeoutSec 20
    Write-Output "HTTP $($r.StatusCode): $($r.Content)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Output "HTTP $code"
    try { $stream = $_.Exception.Response.GetResponseStream(); $reader = New-Object System.IO.StreamReader($stream); Write-Output $reader.ReadToEnd() } catch {}
}

# Check login
Write-Output "`n=== LOGIN ==="
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -Body '{"username":"admin","password":"admin123"}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 20
    Write-Output "HTTP $($r.StatusCode): $($r.Content.Substring(0,[Math]::Min(200,$r.Content.Length)))"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Output "HTTP $code"
    try { $stream = $_.Exception.Response.GetResponseStream(); $reader = New-Object System.IO.StreamReader($stream); Write-Output $reader.ReadToEnd() } catch {}
}

# Check root (frontend)
Write-Output "`n=== ROOT ==="
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/" -UseBasicParsing -TimeoutSec 20
    Write-Output "HTTP $($r.StatusCode) - first 100 chars: $($r.Content.Substring(0,100))"
} catch {
    Write-Output "HTTP $($_.Exception.Response.StatusCode.value__)"
}
