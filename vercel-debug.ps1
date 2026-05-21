$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token" }
$deployId = "dpl_CvLqQpCxQfnx3vBbfxgpnz9GbSMU"

# Get deployment files list
try {
    $files = Invoke-RestMethod -Uri "https://api.vercel.com/v6/deployments/$deployId/files" -Headers $headers
    Write-Output "Files in deployment:"
    $files | ForEach-Object { Write-Output "  $($_.type) $($_.name)" }
} catch {
    Write-Output "Files error: $($_.ErrorDetails.Message)"
}
