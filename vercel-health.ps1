$baseUrl = "https://manufacturing-oee-platform-929i1qgcs-oee-platform-s-projects.vercel.app"

$paths = @("/api/health", "/", "/api/auth/login")
foreach ($p in $paths) {
    try {
        $resp = Invoke-WebRequest -Uri "$baseUrl$p" -UseBasicParsing -TimeoutSec 15
        Write-Output "HTTP $($resp.StatusCode) - $p"
        if ($p -eq "/api/health") { Write-Output "  Body: $($resp.Content)" }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        Write-Output "HTTP $code - $p"
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
            Write-Output "  Body: $body"
        } catch {}
    }
}
