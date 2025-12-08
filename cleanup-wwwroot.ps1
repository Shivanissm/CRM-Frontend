# Final cleanup script - removes all files except assets/, index.html, web.config
# This can be used as a Startup Command in Azure Portal

$wwwroot = "C:\home\site\wwwroot"
$keep = @('assets', 'index.html', 'web.config')

Write-Host "Cleaning wwwroot: $wwwroot"

if (Test-Path $wwwroot) {
    $items = Get-ChildItem $wwwroot -Force
    foreach ($item in $items) {
        if ($keep -notcontains $item.Name) {
            Write-Host "Removing: $($item.Name)"
            Remove-Item $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Cleanup complete. wwwroot now contains only: $($keep -join ', ')"
} else {
    Write-Host "wwwroot does not exist"
}

