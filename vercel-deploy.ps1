$token = $env:VERCEL_TOKEN
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

# Get projects
try {
    $projects = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects" -Headers $headers -Method GET
    Write-Output "Projects found:"
    $projects.projects | ForEach-Object { Write-Output "  ID: $($_.id)  Name: $($_.name)" }

    # Find our project
    $proj = $projects.projects | Where-Object { $_.name -like "*oee*" -or $_.name -like "*manufacturing*" } | Select-Object -First 1
    if ($proj) {
        Write-Output "Target project: $($proj.name) ($($proj.id))"

        # Trigger redeploy from latest git commit
        $body = @{
            name = $proj.name
            gitSource = @{
                type = "github"
                repoId = $proj.link.repoId
                ref = "main"
            }
            target = "production"
        } | ConvertTo-Json -Depth 5

        $deploy = Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments" -Headers $headers -Method POST -Body $body
        Write-Output "Deployment triggered! URL: $($deploy.url)"
        Write-Output "Deployment ID: $($deploy.id)"
    } else {
        Write-Output "Project not found. All projects:"
        $projects.projects | ForEach-Object { Write-Output "  $($_.name)" }
    }
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    Write-Output $_.ErrorDetails.Message
}
