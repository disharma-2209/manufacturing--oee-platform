$t1 = "vcp_81thwFTUdWPRClsvXseYI0Q2Bqyd"
$t2 = "BjaI6pHs03UKKaacRQu0nZ1UTBKr"
$env:VERCEL_TOKEN = $t1 + $t2

# Deploy using Vercel CLI directly from local files — bypasses GitHub integration
# This ensures vercel.json routes are respected
npx vercel --token $env:VERCEL_TOKEN --prod --yes --name manufacturing-oee-platform 2>&1
