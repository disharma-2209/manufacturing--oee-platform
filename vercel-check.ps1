$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token" }
$deployId = "dpl_2Las7AXvVpFEzQFrrA7fSugFwgAa"

try {
    $deploy = Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments/$deployId" -Headers $headers
    Write-Output "Status: $($deploy.status)"
    Write-Output "URL: https://$($deploy.url)"
    if ($deploy.errorMessage) { Write-Output "Error: $($deploy.errorMessage)" }
} catch {
    Write-Output $_.ErrorDetails.Message
}
