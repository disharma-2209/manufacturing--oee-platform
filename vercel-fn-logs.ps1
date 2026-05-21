$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token" }
$deployId = "dpl_2mrQapXvF6MRRfjMJLAvk63pf6Zh"

# Get runtime logs
try {
    $logs = Invoke-RestMethod -Uri "https://api.vercel.com/v2/deployments/$deployId/events?limit=50&types=error,warning,stdout,stderr" -Headers $headers
    if ($logs.Count -eq 0) {
        Write-Output "No logs found - triggering a request first..."
    }
    $logs | ForEach-Object {
        if ($_.text) { Write-Output "$($_.created): $($_.text)" }
        if ($_.payload.text) { Write-Output "$($_.created): $($_.payload.text)" }
    }
} catch {
    Write-Output $_.ErrorDetails.Message
}
