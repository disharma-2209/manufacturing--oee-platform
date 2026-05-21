@echo off
if "%VERCEL_TOKEN%"=="" (
  echo ERROR: Set VERCEL_TOKEN env var first
  exit /b 1
)
npx vercel --token %VERCEL_TOKEN% --prod --yes > vercel-deploy-out.txt 2>&1
echo EXIT:%ERRORLEVEL% >> vercel-deploy-out.txt
