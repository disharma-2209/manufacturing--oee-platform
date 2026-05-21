$baseUrl = "https://manufacturing-oee-platform-lq6jm6qjq-oee-platform-s-projects.vercel.app"

$paths = @("/api/diag", "/api/health", "/api/test", "/")
foreach ($p in $paths) {
    try {
        $resp = Invoke-WebRequest -Uri "$baseUrl$p" -UseBasicParsing -TimeoutSec 20
        $preview = $resp.Content.Substring(0, [Math]::Min(120, $resp.Content.Length)) -replace "`n"," "
        Write-Output "HTTP $($resp.StatusCode) $p | $preview"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        Write-Output "HTTP $code $p"
    }
}
