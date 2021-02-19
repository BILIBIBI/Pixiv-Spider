param(
[string]$Path=$(throw "Parameter missing: -Path PATH"),
[string]$SName=$(throw "Parameter missing: -SName NAME"),
[string]$SAuthor=$(throw "Parameter missing: -SAuthor AUTHOR")
);
$OutputEncoding = New-Object -typename System.Text.UTF8Encoding
[Console]::OutputEncoding = New-Object -typename System.Text.UTF8Encoding
$Path=[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Path));
$SName=[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($SName));
$SAuthor=[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($SAuthor));
if(-Not (Test-Path -Path $Path)){
    throw "Path not exist: $Path"
}
$_=Get-ItemProperty -Path $Path;
$extentmark = 0;
$imwidth=magick identify -ping -format "%w" $Path
$imwidth=[int]$imwidth;
If(($imwidth)%2 -ne 0)
{
    $imwidth=$imwidth+1;
    $extentmark=1;
}
$imheight=magick identify -ping -format "%h" $Path;
$imheight=[int]$imheight;
If(($imheight)%2 -ne 0)
{
        $imheight=$imheight+1;
        $extentmark=1;
}
$ttpath = $Path;
If($extentmark)
{
        magick $Path -gravity center -strip -extent "($imwidth)x($imheight)" -quality 100% "$($Path).tmp";
        $ttpath = "$($Path).tmp";
}

$crfval= 10;
ffmpeg -y -hide_banner -nostats -loglevel error -i $ttpath  -crf $crfval  -pix_fmt yuv420p -sws_flags spline+accurate_rnd+full_chroma_int -color_range 1 -colorspace 5 -color_primaries 5 -color_trc 6 -f hevc -x265-params "log-level=error" "$($Path).hvc";
MP4Box -quiet -add-image "$($Path).hvc:primary" -ab heic -new "$($Path).heic";
Remove-Item("$($Path).hvc");
if($extentmark){Remove-Item($ttpath);}

if(Test-Path -Path "$($Path).heic"){
    $ConvLength = (Get-ItemProperty -Path "$($Path).heic").Length;
}else{
    $ConvLength = 0;
}

if(($ConvLength -gt 0) -and ($_.Length -gt $ConvLength)){
    Set-ItemProperty -Path "$($Path).heic" -Name CreationTime -Value $_.CreationTime
    Set-ItemProperty -Path "$($Path).heic" -Name LastWriteTime -Value $_.LastWriteTime
    Remove-Item -Path "$($Path)"
    Write-Host("下载完成: 文件: $($_.Name).heic	作品: $SName	画师：$SAuthor")
}else{
    if(Test-Path -Path "$($Path).heic"){ Remove-Item -Path "$($Path).heic"; }
    Write-Host("下载完成: 文件: $($_.Name)	作品: $SName	画师：$SAuthor")
}