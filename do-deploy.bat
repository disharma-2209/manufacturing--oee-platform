@echo off
if "%VERCEL_TOKEN%"=="" echo ERROR: Set VERCEL_TOKEN env var && exit /b 1
npx vercel --token %VERCEL_TOKEN% --prod --yes > vercel-deploy-out.txt 2>&1
