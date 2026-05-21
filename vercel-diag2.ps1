$baseUrl = "https://manufacturing-oee-platform-lq6jm6qjq-oee-platform-s-projects.vercel.app"
$r = Invoke-WebRequest -Uri "$baseUrl/api/diag" -UseBasicParsing -TimeoutSec 20
$r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 3
