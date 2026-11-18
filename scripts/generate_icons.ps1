Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\PC\.gemini\antigravity\brain\676488e7-53cd-4558-aa86-5918d630a40f\myth_or_fact_maker_app_icon_1795043034231.jpg"
$srcImg = [System.Drawing.Image]::FromFile($srcPath)

function Resize-Image($src, $w, $h, $outPath, $isRound = $false) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    if ($isRound) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $w, $h)
        $g.SetClip($path)
    }
    
    $g.DrawImage($src, 0, 0, $w, $h)
    $g.Dispose()
    
    $dir = [System.IO.Path]::GetDirectoryName($outPath)
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Saved: $outPath ($w by $h)"
}

# Android Mipmap dimensions
$resMap = @(
    @{ folder='mipmap-mdpi'; size=48; fgSize=108 },
    @{ folder='mipmap-hdpi'; size=72; fgSize=162 },
    @{ folder='mipmap-xhdpi'; size=96; fgSize=216 },
    @{ folder='mipmap-xxhdpi'; size=144; fgSize=324 },
    @{ folder='mipmap-xxxhdpi'; size=192; fgSize=432 }
)

$resBase = "android\app\src\main\res"

foreach ($item in $resMap) {
    $f = $item.folder
    $s = $item.size
    $fg = $item.fgSize
    
    Resize-Image $srcImg $s $s "$resBase\$f\ic_launcher.png" $false
    Resize-Image $srcImg $s $s "$resBase\$f\ic_launcher_round.png" $true
    Resize-Image $srcImg $fg $fg "$resBase\$f\ic_launcher_foreground.png" $false
}

# Web public icons
Resize-Image $srcImg 512 512 "public\icon.png" $false
Resize-Image $srcImg 64 64 "public\favicon.png" $false

$srcImg.Dispose()
Write-Output "All icons generated successfully!"
