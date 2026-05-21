$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token" }
$projectId = "prj_wR1SB8mGwfjRrhqmmmwHTOyEW4BZ"

$proj = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId" -Headers $headers
Write-Output "Project: $($proj.name)"
Write-Output "=== Git Link ==="
$proj.link | ConvertTo-Json
