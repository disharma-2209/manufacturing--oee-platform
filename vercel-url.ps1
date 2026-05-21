$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token" }
$projectId = "prj_wR1SB8mGwfjRrhqmmmwHTOyEW4BZ"

$proj = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId" -Headers $headers
Write-Output "Project: $($proj.name)"
Write-Output "Latest deployment URL: https://$($proj.latestDeployments[0].url)"

# Get domains
$domains = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId/domains" -Headers $headers
Write-Output "Domains:"
$domains.domains | ForEach-Object { Write-Output "  https://$($_.name)" }
