$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

$bodyObj = @{
    name = "manufacturing-oee-platform"
    gitSource = @{
        type = "github"
        repoId = "1245383397"
        ref = "main"
    }
    target = "production"
}
$body = $bodyObj | ConvertTo-Json -Depth 5

try {
    $deploy = Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments?projectId=prj_wR1SB8mGwfjRrhqmmmwHTOyEW4BZ" -Headers $headers -Method POST -Body $body
    Write-Output "SUCCESS!"
    Write-Output "URL: https://$($deploy.url)"
    Write-Output "ID: $($deploy.id)"
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    Write-Output $_.ErrorDetails.Message
}
