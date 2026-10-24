import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const run = promisify(execFile);
// Fixed script; paths are data in environment variables, never PowerShell source.
const script = `
$ErrorActionPreference = 'Stop'
$target = $env:LINGYU_PRIVATE_PATH
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
if ($env:LINGYU_PRIVATE_CREATE -eq '1') {
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($identity in @($sid, $system)) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  [System.IO.Directory]::SetAccessControl($target, $acl)
}
$acl = if ($env:LINGYU_PRIVATE_DIRECTORY -eq '1') { [System.IO.Directory]::GetAccessControl($target) } else { [System.IO.File]::GetAccessControl($target) }
if ($env:LINGYU_PRIVATE_DIRECTORY -eq '1' -and !$acl.AreAccessRulesProtected) { throw 'Unprotected' }
if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -notin @($sid.Value, $system.Value, 'S-1-5-32-544')) { throw 'Owner' }
$hasOwnerAccess = $false
foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -eq 'Allow') {
    if ($rule.IdentityReference.Value -notin @($sid.Value, $system.Value)) { throw 'Public' }
    if ($rule.IdentityReference.Value -eq $sid.Value -and
        ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl -and
        ($rule.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0) { $hasOwnerAccess = $true }
  }
}
if (!$hasOwnerAccess) { throw 'Missing owner access' }
`;

/** Only called for Windows development quarantine; errors are masked by its public boundary. */
export async function privateWindowsPath(path: string, directory: boolean, initialize = false): Promise<void> {
  const windowsRoot = process.env.SystemRoot;
  if (!windowsRoot) throw new Error('Windows runtime unavailable');
  await run(join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      env: { ...process.env, LINGYU_PRIVATE_PATH: path, LINGYU_PRIVATE_CREATE: initialize ? '1' : '0', LINGYU_PRIVATE_DIRECTORY: directory ? '1' : '0' },
      windowsHide: true, timeout: 10000, maxBuffer: 16384,
    });
}
