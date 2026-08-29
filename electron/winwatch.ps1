# 前台窗口 + 空闲时长观察器：每 5 秒输出一行 JSON {proc, full, idle}
# 隐私边界：只取「进程名」和「距上次键鼠输入的秒数」。
# 绝不读取窗口标题、剪贴板、按键内容。数据只在内存里传给渲染层，不落盘、不联网。
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct NLRECT { public int L, T, R, B; }
[StructLayout(LayoutKind.Sequential)]
public struct NLLASTINPUT { public uint cbSize; public uint dwTime; }
public class NLWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int procId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out NLRECT r);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref NLLASTINPUT p);
  [DllImport("kernel32.dll")] public static extern uint GetTickCount();
}
"@
Add-Type -AssemblyName System.Windows.Forms

while ($true) {
  $h = [NLWin]::GetForegroundWindow()
  $procId = 0
  [void][NLWin]::GetWindowThreadProcessId($h, [ref]$procId)

  $name = ''
  try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { $name = '' }

  $r = [NLRECT]::new()
  [void][NLWin]::GetWindowRect($h, [ref]$r)
  $scr = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  # 窗口铺满整个主屏 => 判定为全屏（演示 / 视频 / 游戏），触发免打扰
  $full = (($r.R - $r.L) -ge $scr.Width) -and (($r.B - $r.T) -ge $scr.Height)

  $li = [NLLASTINPUT]::new()
  $li.cbSize = [uint32][System.Runtime.InteropServices.Marshal]::SizeOf([type][NLLASTINPUT])
  $idle = 0
  if ([NLWin]::GetLastInputInfo([ref]$li)) {
    $idle = [int](([NLWin]::GetTickCount() - $li.dwTime) / 1000)
    if ($idle -lt 0) { $idle = 0 }
  }

  Write-Output (@{ proc = $name; full = [bool]$full; idle = $idle } | ConvertTo-Json -Compress)
  [Console]::Out.Flush()
  Start-Sleep -Seconds 5
}
