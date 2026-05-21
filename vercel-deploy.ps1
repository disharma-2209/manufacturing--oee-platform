$token = $env:VERCEL_TOKEN
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$projectId = "prj_wR1SB8mGwfjRrhqmmmwHTOyEW4BZ"

try {
    $bodyObj = @{
        name = "manufacturing-oee-platform"
        gitSource = @{
            type = "github"
            repoId = "978283148"
            ref = "main"
        }
        target = "production"
        projectId = $projectId
    }
    $body = $bodyObj | ConvertTo-Json -Depth 5
    $deploy = Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments" -Headers $headers -Method POST -Body $body
    Write-Output "Deployment triggered!"
    Write-Output "URL: $($deploy.url)"
    Write-Output "ID: $($deploy.id)"
    Write-Output "Status: $($deploy.status)"
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    Write-Output $_.ErrorDetails.Message
}
