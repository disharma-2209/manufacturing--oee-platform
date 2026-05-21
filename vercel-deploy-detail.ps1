$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token" }
$deployId = "dpl_6VTUcKcEhZ2AwBu23Kh2vgMfj66M"

$deploy = Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments/$deployId" -Headers $headers

Write-Output "=== GIT SOURCE ==="
$deploy.gitSource | ConvertTo-Json

Write-Output "=== BUILDS ==="
$deploy.builds | ConvertTo-Json -Depth 3

Write-Output "=== ROUTES ==="
$deploy.routes | ConvertTo-Json -Depth 3

Write-Output "=== FUNCTIONS ==="
$deploy.functions | ConvertTo-Json -Depth 3
