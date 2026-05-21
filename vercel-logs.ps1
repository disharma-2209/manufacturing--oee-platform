$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token" }
$deployId = "dpl_6t3ACKGiX8Q1jMXzweG63MfWfRkm"

try {
    $logs = Invoke-RestMethod -Uri "https://api.vercel.com/v2/deployments/$deployId/events" -Headers $headers
    $logs | ForEach-Object { 
        if ($_.text) { Write-Output $_.text }
    }
} catch {
    Write-Output $_.ErrorDetails.Message
}
