$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$projectId = "prj_wR1SB8mGwfjRrhqmmmwHTOyEW4BZ"

# Disable deployment protection (Vercel auth wall)
$body = '{"ssoProtection":null,"passwordProtection":null,"trustedIps":null}'

try {
    $r = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId" -Headers $headers -Method PATCH -Body $body
    Write-Output "Protection settings updated"
    Write-Output "ssoProtection: $($r.ssoProtection)"
    Write-Output "passwordProtection: $($r.passwordProtection)"
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    Write-Output $_.ErrorDetails.Message
}
