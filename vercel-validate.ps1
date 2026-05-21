$baseUrl = "https://manufacturing-oee-platform-4u0iogiyk-oee-platform-s-projects.vercel.app"

$paths = @("/api/test", "/api/health", "/")
foreach ($p in $paths) {
    try {
        $resp = Invoke-WebRequest -Uri "$baseUrl$p" -UseBasicParsing -TimeoutSec 20
        Write-Output "HTTP $($resp.StatusCode) - $p"
        Write-Output "  $($resp.Content.Substring(0, [Math]::Min(200, $resp.Content.Length)))"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        Write-Output "HTTP $code - $p"
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
            if ($body) { Write-Output "  $($body.Substring(0, [Math]::Min(300, $body.Length)))" }
        } catch {}
    }
}
