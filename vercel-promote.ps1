$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$projectId = "prj_wR1SB8mGwfjRrhqmmmwHTOyEW4BZ"
$deployId = "dpl_5yAn6LfDAUfz7kTeKXYQdN3gBPk1"

# Promote to production alias
try {
    $body = "{`"id`":`"$deployId`"}"
    $r = Invoke-RestMethod -Uri "https://api.vercel.com/v10/projects/$projectId/promote/$deployId" -Headers $headers -Method POST -Body $body
    Write-Output "Promoted to production!"
} catch {
    Write-Output $_.ErrorDetails.Message
}

# Get production aliases
$proj = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId" -Headers $headers
Write-Output "Production URLs:"
$proj.alias | ForEach-Object { Write-Output "  https://$($_.domain)" }
