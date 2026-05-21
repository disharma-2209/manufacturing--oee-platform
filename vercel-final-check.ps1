$baseUrl = "https://manufacturing-oee-platform-4u0iogiyk-oee-platform-s-projects.vercel.app"

# Check health
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing -TimeoutSec 20
    Write-Output "Health: HTTP $($r.StatusCode)"
    Write-Output "  $($r.Content)"
} catch {
    Write-Output "Health: HTTP $($_.Exception.Response.StatusCode.value__)"
}

# Check login
try {
    $body = '{"username":"admin","password":"admin123"}'
    $r = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 20
    Write-Output "Login: HTTP $($r.StatusCode)"
    Write-Output "  $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Output "Login: HTTP $code"
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Output "  $($reader.ReadToEnd())"
    } catch {}
}
