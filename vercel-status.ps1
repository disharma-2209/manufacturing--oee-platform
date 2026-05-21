$token = $env:VERCEL_TOKEN
$headers = @{ Authorization = "Bearer $token" }
$deployId = "dpl_5CPDBrYhfk5kGBAsp8Ay1CqroAN7"

$deploy = Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments/$deployId" -Headers $headers
Write-Output "Status: $($deploy.status)"
Write-Output "URL: $($deploy.url)"
if ($deploy.errorMessage) { Write-Output "Error: $($deploy.errorMessage)" }
