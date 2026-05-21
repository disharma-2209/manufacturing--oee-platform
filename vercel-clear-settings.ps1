$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$projectId = "prj_wR1SB8mGwfjRrhqmmmwHTOyEW4BZ"

# Clear ALL overrides so vercel.json is fully in control
$body = '{"rootDirectory":null,"buildCommand":null,"outputDirectory":null,"installCommand":null,"framework":null}'

try {
    $r = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId" -Headers $headers -Method PATCH -Body $body
    Write-Output "Cleared all project overrides!"
    Write-Output "buildCommand: '$($r.buildCommand)'"
    Write-Output "outputDirectory: '$($r.outputDirectory)'"
    Write-Output "installCommand: '$($r.installCommand)'"
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    Write-Output $_.ErrorDetails.Message
}
