$baseUrl = "https://manufacturing-oee-platform-p6b38am92-oee-platform-s-projects.vercel.app"

try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/diag" -UseBasicParsing -TimeoutSec 20
    Write-Output "Diag: HTTP $($r.StatusCode)"
    $r.Content | ConvertFrom-Json | ConvertTo-Json
} catch {
    Write-Output "Diag: HTTP $($_.Exception.Response.StatusCode.value__)"
    try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Output $reader.ReadToEnd()
    } catch {}
}
