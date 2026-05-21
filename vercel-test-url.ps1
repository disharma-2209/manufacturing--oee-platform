$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token" }

# Test what paths actually return 200
$baseUrl = "https://manufacturing-oee-platform-929i1qgcs-oee-platform-s-projects.vercel.app"
$paths = @("/", "/index.html", "/public/index.html", "/assets/index-CEcg5zfl.js", "/public/assets/index-CEcg5zfl.js")

foreach ($p in $paths) {
    try {
        $resp = Invoke-WebRequest -Uri "$baseUrl$p" -UseBasicParsing -ErrorAction SilentlyContinue
        Write-Output "  $($resp.StatusCode) $p"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        Write-Output "  $code $p"
    }
}
