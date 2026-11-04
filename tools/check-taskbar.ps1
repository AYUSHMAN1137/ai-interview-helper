# check-taskbar.ps1 — READ-ONLY diagnostic for the taskbar-icon problem.
#
# WHY THIS EXISTS
# ---------------
# "The icon is still there" can mean three completely different things, and each
# needs a different fix. This script tells them apart by reading the real Win32
# extended styles off every top-level window owned by every electron.exe process.
#
#   1. WS_EX_APPWINDOW is SET          -> the native fix did NOT take effect.
#                                         Windows always shows a taskbar button.
#   2. TOOLWINDOW set, no APPWINDOW    -> the native fix DID work on that window,
#                                         so the icon you see belongs to a
#                                         DIFFERENT window (usually DevTools).
#   3. neither bit set, top-level      -> Windows may still show a button.
#
# Run it while the app is running:
#     powershell -ExecutionPolicy Bypass -File tools/check-taskbar.ps1
#
# It only READS. It changes nothing on your system.

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class WinDiag {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtrW(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLongW(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

  public static List<string> ForPid(uint pid) {
    List<string> rows = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint wpid;
      GetWindowThreadProcessId(h, out wpid);
      if (wpid != pid) return true;

      StringBuilder cls = new StringBuilder(256);
      GetClassNameW(h, cls, 256);
      StringBuilder txt = new StringBuilder(256);
      GetWindowTextW(h, txt, 256);

      // GWL_EXSTYLE = -20 ; WS_EX_TOOLWINDOW = 0x80 ; WS_EX_APPWINDOW = 0x40000
      int ex32 = GetWindowLongW(h, -20);
      long exPtr = GetWindowLongPtrW(h, -20).ToInt64();

      bool app32  = (ex32  & 0x40000) != 0;
      bool tool32 = (ex32  & 0x80)    != 0;
      bool appPtr  = (exPtr & 0x40000) != 0;
      bool toolPtr = (exPtr & 0x80)    != 0;

      IntPtr owner = GetWindow(h, 4);   // GW_OWNER
      IntPtr root  = GetAncestor(h, 2); // GA_ROOT

      string verdict;
      if (app32 || appPtr)        verdict = "*** TASKBAR BUTTON - WS_EX_APPWINDOW IS SET ***";
      else if (tool32 || toolPtr) verdict = "hidden from taskbar (WS_EX_TOOLWINDOW)";
      else                        verdict = "top-level with no TOOLWINDOW -> MAY show a button";

      rows.Add(String.Format(
        "  hwnd=0x{0:X}\r\n    class='{1}'  title='{2}'\r\n    visible={3}  owner=0x{4:X}  root=0x{5:X}\r\n    exStyle(GetWindowLongW)    = 0x{6:X}   APPWINDOW={7} TOOLWINDOW={8}\r\n    exStyle(GetWindowLongPtrW) = 0x{9:X}   APPWINDOW={10} TOOLWINDOW={11}\r\n    => {12}",
        h.ToInt64(), cls.ToString(), txt.ToString(),
        IsWindowVisible(h), owner.ToInt64(), root.ToInt64(),
        ex32, app32, tool32,
        exPtr, appPtr, toolPtr,
        verdict));
      return true;
    }, IntPtr.Zero);
    return rows;
  }
}
"@

$procs = Get-Process -Name electron -ErrorAction SilentlyContinue
if (-not $procs) {
  Write-Host "RESULT: NO electron.exe process is running."
  Write-Host "        Start the app (Start.bat) and re-run this diagnostic."
  exit 0
}

foreach ($p in $procs) {
  Write-Host "==============================================================="
  Write-Host ("PID {0}   started {1}" -f $p.Id, $p.StartTime)
  Write-Host ("MainWindowTitle: '{0}'" -f $p.MainWindowTitle)
  Write-Host "---------------------------------------------------------------"
  $rows = [WinDiag]::ForPid([uint32]$p.Id)
  if ($rows.Count -eq 0) { Write-Host "  (no top-level windows)" }
  else { $rows | ForEach-Object { Write-Host $_ } }
}
Write-Host "==============================================================="
Write-Host "done."
