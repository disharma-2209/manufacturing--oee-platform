$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$projectId = "prj_wR1SB8mGwfjRrhqmmmwHTOyEW4BZ"

# Fix project settings: clear rootDirectory, set correct build/output
$bodyObj = @{
    rootDirectory = $null
    buildCommand = "echo prebuilt"
    outputDirectory = "public"
    installCommand = "npm install"
    framework = $null
}
$body = $bodyObj | ConvertTo-Json -Depth 3

try {
    $r = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId" -Headers $headers -Method PATCH -Body $body
    Write-Output "Project updated!"
    Write-Output "Root Dir: $($r.rootDirectory)"
    Write-Output "Build: $($r.buildCommand)"
    Write-Output "Output: $($r.outputDirectory)"
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    Write-Output $_.ErrorDetails.Message
}
