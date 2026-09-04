param(
  [Parameter(Mandatory = $true)][string]$SourceDirectory,
  [Parameter(Mandatory = $true)][string]$VcpkgRoot,
  [string]$OutputDirectory = "$PSScriptRoot/../src-tauri/target/conpty-ordered-prototype"
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot/..").Path
$source = (Resolve-Path -LiteralPath $SourceDirectory).Path
$ports = (Resolve-Path -LiteralPath $VcpkgRoot).Path
$lock = Get-Content -LiteralPath "$repo/native/conpty/upstream.lock.json" -Raw | ConvertFrom-Json
$patch = "$repo/native/conpty/patches/g0-ordered-output.patch"
function Assert-Exit([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step failed (exit $LASTEXITCODE)" }
}
if ((git -C $source rev-parse HEAD) -ne $lock.commit) { throw 'Unexpected terminal source commit' }
Assert-Exit 'Source identity'
if ((git -C $ports rev-parse HEAD) -ne $lock.vcpkgCommit) { throw 'Unexpected vcpkg source commit' }
Assert-Exit 'vcpkg identity'
$allowedChanges = @('src/host/VtIo.cpp', 'src/host/VtIo.hpp', 'src/host/screenInfo.cpp')
foreach ($changed in (git -C $source diff --name-only HEAD)) {
  if ($changed -notin $allowedChanges) { throw "Unrelated source changes: $changed" }
}
git -C $source apply --reverse --check $patch 2>$null
if ($LASTEXITCODE -ne 0) {
  git -C $source diff --quiet HEAD
  Assert-Exit 'Source must be clean before applying prototype'
  git -C $source apply --check $patch
  Assert-Exit 'Patch check'
  git -C $source apply $patch
  Assert-Exit 'Apply prototype'
}
$actualPatch = [System.IO.Path]::GetTempFileName()
try {
  git -C $source diff --no-ext-diff --no-textconv "--output=$actualPatch" HEAD -- $allowedChanges
  Assert-Exit 'Read patched source identity'
  if ((Get-FileHash -LiteralPath $actualPatch).Hash -ne (Get-FileHash -LiteralPath $patch).Hash) {
    throw 'Source has changes beyond the pinned prototype patch'
  }
} finally { Remove-Item -LiteralPath $actualPatch }
$vswhere = "${env:ProgramFiles(x86)}/Microsoft Visual Studio/Installer/vswhere.exe"
$vsRoot = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
Assert-Exit 'Visual Studio discovery'
if (!$vsRoot) { throw 'Visual Studio C++ build tools are required' }
$msbuild = Join-Path $vsRoot 'MSBuild/Current/Bin/MSBuild.exe'
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$output = (Resolve-Path -LiteralPath $OutputDirectory).Path
$archive = Join-Path $output 'stock-conpty.zip'
if (!(Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $lock.packageUrl -OutFile $archive }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $lock.packageSha256) { throw 'Package digest mismatch' }
$stock = Join-Path $output 'stock'
if (!(Test-Path -LiteralPath $stock)) { Expand-Archive -LiteralPath $archive -DestinationPath $stock }
$dll = Join-Path $stock 'runtimes/win-x64/native/conpty.dll'
if ((Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash -ne $lock.x64DllSha256) { throw 'ConPTY DLL digest mismatch' }
Push-Location $source
try {
  & "$ports/bootstrap-vcpkg.bat" -disableMetrics
  Assert-Exit 'Bootstrap vcpkg'
  & "$source/dep/nuget/nuget.exe" restore dep/nuget/packages.config -PackagesDirectory packages -NonInteractive
  Assert-Exit 'Restore native NuGet dependencies'
  # Install outside MSBuild's child job. Historical port blobs may need to be
  # fetched by Git; the MSBuild child environment can prevent its network thread.
  & "$ports/vcpkg.exe" install --triplet x64-windows-static --x-feature=terminal "--x-manifest-root=$source" "--x-install-root=$source/obj/x64/vcpkg"
  Assert-Exit 'Install native ports'
  & $msbuild src/host/exe/Host.EXE.vcxproj /m:2 /nr:false /p:Configuration=Release /p:Platform=x64 "/p:SolutionDir=$source\" "/p:VcpkgRoot=$ports" /p:VcpkgManifestInstall=false /v:minimal /nologo
  Assert-Exit 'Build prototype host'
} finally { Pop-Location }
Copy-Item -LiteralPath "$source/bin/x64/Release/OpenConsole.exe" -Destination "$output/OpenConsole.exe"
Copy-Item -LiteralPath $dll -Destination "$output/conpty.dll"
Push-Location "$repo/src-tauri"
try {
  cargo build --example conpty_resize_probe
  Assert-Exit 'Build probe'
} finally { Pop-Location }
Copy-Item -LiteralPath "$repo/src-tauri/target/debug/examples/conpty_resize_probe.exe" -Destination "$output/conpty_resize_probe.exe"
$identity = @{
  stage = $lock.stage
  sourceCommit = $lock.commit
  vcpkgCommit = $lock.vcpkgCommit
  patchSha256 = (Get-FileHash -LiteralPath $patch -Algorithm SHA256).Hash
  hostSha256 = (Get-FileHash -LiteralPath "$output/OpenConsole.exe" -Algorithm SHA256).Hash
  dllSha256 = (Get-FileHash -LiteralPath "$output/conpty.dll" -Algorithm SHA256).Hash
}
$identity | ConvertTo-Json | Set-Content -LiteralPath "$output/build-identity.json" -Encoding utf8
Write-Output "Experimental native probe built at $output; this is not a packaged Qterm runtime."
