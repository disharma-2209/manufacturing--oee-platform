$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token" }
$deployId = "dpl_CvLqQpCxQfnx3vBbfxgpnz9GbSMU"

# Try different file tree endpoints
$endpoints = @(
    "https://api.vercel.com/v7/deployments/$deployId/files",
    "https://api.vercel.com/v6/deployments/$deployId/files",
    "https://api.vercel.com/v2/deployments/$deployId/files"
)

foreach ($ep in $endpoints) {
    try {
        $r = Invoke-RestMethod -Uri $ep -Headers $headers
        Write-Output "SUCCESS at $ep"
        $r | ConvertTo-Json -Depth 4
        break
    } catch {
        Write-Output "FAIL $ep : $(($_.ErrorDetails.Message | ConvertFrom-Json).error.message)"
    }
}
