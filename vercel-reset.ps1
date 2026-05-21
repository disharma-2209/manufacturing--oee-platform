$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$token = $t1 + $t2
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$projectId = "prj_wR1SB8mGwfjRrhqmmmwHTOyEW4BZ"

# Get current project settings first
$proj = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId" -Headers $headers
Write-Output "Current settings:"
Write-Output "  rootDirectory: '$($proj.rootDirectory)'"
Write-Output "  buildCommand: '$($proj.buildCommand)'"
Write-Output "  outputDirectory: '$($proj.outputDirectory)'"
Write-Output "  installCommand: '$($proj.installCommand)'"
Write-Output "  framework: '$($proj.framework)'"
