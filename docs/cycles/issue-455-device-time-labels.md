# 455.4B3 Remembered-Device Date Labels

Trace: modules/security/remembered-devices.js issueDevice writes created_at
and expires_at from the server's fixed30day token lifetime; revokeDevice
writes revoked_at. history validates canonical instants/temporal consistency;
listDevices derives active from nonrevoked expiry>now. Auth routes expose only
own metadata. dashboard/wos-remember-devices.js validates exact rows and renders
Added/Forgotten/Expires/Expired. No other consumer or backend writer changes.

Reuse shared clock3 formatTime for recorded history and expired dates;
formatScheduledTime for future expiry only. Keep server active/current/revoked
authority and all token/session/TTL/revocation/401/abort/late-result behavior.
No browser-local fallback; unavailable formatter shows Time not confirmed.
Only classic device asset cache1->2; native auth and key surfaces unchanged.
Synthetic late-December now allows real30day future expiry across year.
Three-width actual component proof and existing signed-server tests required;
no production device/private metadata reads, keys, auth transfer or writes.
Whole455/487 remains incomplete. No existing assertion changes.

New socket-free actual component testPASS1366/400/412 with Tokyo timezone;
three positive synthetic images inspected (isolated component, not full shell).
Recent/old-year/future expiry, server state, missing clock and invalid rows
without false zero tested, no external/nonGET/errors or source mutation.
Unchanged signed-server remembered-device-ui focused check FIRST FAILED at
startup line52:5, routed0/completed0/no mainStatus. Cause UNPROVEN; no auth/
fixture/assertion change or unchanged focused retry. No environment attribution.
First full gate pending, not green; nothing pushed or released for this slice.
