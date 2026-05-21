$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$projectId = "prj_wR1SB8mGwfjRrhqmmmwHTOyEW4BZ"

$body = '{"installCommand":"npm install --ignore-scripts"}'

try {
    $r = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId" -Headers $headers -Method PATCH -Body $body
    Write-Output "Updated! installCommand: $($r.installCommand)"
} catch {
    Write-Output $_.ErrorDetails.Message
}
