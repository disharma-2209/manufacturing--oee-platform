$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token" }
$deployId = "dpl_CvLqQpCxQfnx3vBbfxgpnz9GbSMU"

# Get full deployment details
$deploy = Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments/$deployId" -Headers $headers
Write-Output "Status: $($deploy.status)"
Write-Output "Build output:"
$deploy.build | ConvertTo-Json -Depth 3
Write-Output "Routes:"
$deploy.routes | ConvertTo-Json -Depth 3
