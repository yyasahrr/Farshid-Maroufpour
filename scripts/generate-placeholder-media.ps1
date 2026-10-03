#requires -Version 7
<#
  Generates the placeholder imagery and background video that the public site
  references (public/images/*.jpg, public/video/*.mp4).

  These files are deliberately abstract, on-brand stand-ins: the project ships no
  salon photography or videography yet, and the UI must not render broken images.
  Replace them with real, licensed media before launch — see ASSETS.md.

  Requirements: ffmpeg on PATH.
  Usage:        pwsh -File scripts/generate-placeholder-media.ps1
#>
param([string]$Root = (Join-Path $PSScriptRoot '..'))

$ErrorActionPreference = 'Stop'
$imagesDir = Join-Path $Root 'public/images'
$videoDir = Join-Path $Root 'public/video'
New-Item -ItemType Directory -Force -Path $imagesDir, $videoDir | Out-Null

function Assert-Ffmpeg {
  if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    throw 'ffmpeg was not found on PATH. Install it, then re-run this script.'
  }
}

function New-Still {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Gradient,  # full lavfi graph, e.g. gradients=s=1920x1080:c0=0x0b1d16:...
    [double]$Vignette = 4.2,
    [int]$Grain = 4,
    [int]$Quality = 4
  )
  $target = Join-Path $imagesDir $Name
  $filters = "noise=alls=${Grain}:allf=t+u,vignette=PI/$Vignette,format=yuvj420p"
  & ffmpeg -y -hide_banner -loglevel error -f lavfi -i $Gradient -frames:v 1 -vf $filters -q:v $Quality $target
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed while writing $Name" }
  Write-Host ("image  {0,-22} {1,9:N0} bytes" -f $Name, (Get-Item -LiteralPath $target).Length)
}

function New-Loop {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Gradient,
    [int]$Seconds = 10,
    [double]$Vignette = 4.2,
    [int]$Grain = 3
  )
  $target = Join-Path $videoDir $Name
  $filters = "noise=alls=${Grain}:allf=t,vignette=PI/$Vignette,format=yuv420p"
  & ffmpeg -y -hide_banner -loglevel error -f lavfi -i $Gradient -t $Seconds -vf $filters `
    -c:v libx264 -preset medium -crf 34 -pix_fmt yuv420p -movflags +faststart -an $target
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed while writing $Name" }
  Write-Host ("video  {0,-22} {1,9:N0} bytes" -f $Name, (Get-Item -LiteralPath $target).Length)
}

Assert-Ffmpeg

# Hero photography used by the atelier layout (16:9, wide crop).
New-Still -Name 'atelier-hero.jpg' -Gradient 'gradients=s=1920x1080:c0=0x0b1d16:c1=0x1b5f42:c2=0x2f4a3a:nb_colors=3:seed=11:type=linear'
# Full-bleed poster behind the bento hero video.
New-Still -Name 'video-poster.jpg' -Gradient 'gradients=s=1920x1080:c0=0x081c14:c1=0x14462f:c2=0x0d2a1f:nb_colors=3:seed=7:type=linear' -Grain 3
# Social/Open Graph card.
New-Still -Name 'og-cover.jpg' -Gradient 'gradients=s=1200x630:c0=0x0f5a3b:c1=0x1f2e27:c2=0xa37b45:nb_colors=3:seed=3:type=radial' -Quality 3
# Portrait tile used by portfolio items and the gallery (4:5-ish).
New-Still -Name 'hero.jpg' -Gradient 'gradients=s=1200x1500:c0=0x14603f:c1=0x2f4a3a:c2=0xa37b45:nb_colors=3:seed=5:type=linear'
# Academy / workshop tile (3:2).
New-Still -Name 'academy.jpg' -Gradient 'gradients=s=1200x800:c0=0xa37b45:c1=0x1f2e27:c2=0x0f5a3b:nb_colors=3:seed=9:type=linear'
# Service detail imagery (4:3), one per seeded service.
New-Still -Name 'svc-haircut.jpg' -Gradient 'gradients=s=1200x900:c0=0x0f5a3b:c1=0x1f2e27:c2=0x3f5548:nb_colors=3:seed=21:type=linear'
New-Still -Name 'svc-fade.jpg' -Gradient 'gradients=s=1200x900:c0=0x0d4f43:c1=0x16241d:c2=0x2f4a3a:nb_colors=3:seed=22:type=linear'
New-Still -Name 'svc-beard.jpg' -Gradient 'gradients=s=1200x900:c0=0x1f2e27:c1=0x0f5a3b:c2=0x6b5213:nb_colors=3:seed=23:type=linear'
New-Still -Name 'svc-grooming.jpg' -Gradient 'gradients=s=1200x900:c0=0x2f4a3a:c1=0x0f5a3b:c2=0xa37b45:nb_colors=3:seed=24:type=linear'

# Product tiles for the shop catalogue (4:3), one per seeded product.
New-Still -Name 'product-pomade.jpg' -Gradient 'gradients=s=1200x900:c0=0x0f5a3b:c1=0x1a3b2d:c2=0xa37b45:nb_colors=3:seed=31:type=linear'
New-Still -Name 'product-clay.jpg' -Gradient 'gradients=s=1200x900:c0=0x3f5548:c1=0x16241d:c2=0x8c8f7a:nb_colors=3:seed=32:type=linear'
New-Still -Name 'product-beard-oil.jpg' -Gradient 'gradients=s=1200x900:c0=0x6b5213:c1=0x1f2e27:c2=0x0f5a3b:nb_colors=3:seed=33:type=linear'
New-Still -Name 'product-shampoo.jpg' -Gradient 'gradients=s=1200x900:c0=0xe3f0e9:c1=0x9dc6b0:c2=0x0f5a3b:nb_colors=3:seed=34:type=linear' -Vignette 6 -Grain 2
# Neutral fallback tile for catalogue rows with no image URL.
New-Still -Name 'placeholder.jpg' -Gradient 'gradients=s=1200x900:c0=0xe3f0e9:c1=0xf7f0d8:c2=0xdfe7e0:nb_colors=3:seed=2:type=linear' -Vignette 7 -Grain 2

# Slow-drifting background loops (silent, muted autoplay in the bento hero).
New-Loop -Name 'barber-desktop.mp4' -Gradient 'gradients=s=1280x720:c0=0x0a2318:c1=0x1b5f42:c2=0x0f5a3b:nb_colors=3:seed=13:speed=0.03:duration=10' -Seconds 10
New-Loop -Name 'barber-mobile.mp4' -Gradient 'gradients=s=720x1280:c0=0x0a2318:c1=0x1b5f42:c2=0x0f5a3b:nb_colors=3:seed=17:speed=0.03:duration=10' -Seconds 10

Write-Host 'Placeholder media generated. Replace with licensed photography/videography before launch.'
